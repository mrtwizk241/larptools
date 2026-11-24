import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, Check, Send } from 'lucide-react';
import { ApiError, api } from '../../../api/client.ts';
import { createTestBuild } from '../../../storage/remote.ts';
import { TEST_BUILD_LIMIT, type UserInfo } from '../../../api/contract.ts';
import { CHARACTERS_PATH, PUBLIC_MODE } from '../../../publicMode.ts';
import { useOptionalAuth } from '../../auth/authContext.ts';
import { Button, ButtonLink, useToast } from '../../components/index.ts';
import { useCommand } from '../../data/engineHooks.ts';
import { useRepository, useSettings } from '../../data/hooks.ts';
import { useRuleset } from '../../data/rulesetContext.ts';
import { Screen } from '../../Screen.tsx';
import { ErrorList } from '../character/ErrorList.tsx';
import {
  EMPTY_DRAFT,
  WIZARD_STEPS,
  dryRunCreate,
  errorMessages,
  hasErrors,
  toCreateCommand,
  toStartingItemsCommand,
  type StepId,
  type WizardDraft,
  type WizardStep,
} from './steps.ts';
import { SkillsStep } from './SkillsStep.tsx';
import { StartingItemsStep } from './StartingItemsStep.tsx';
import { AncestryStep, LxpStep, NamesStep, ReviewStep, type StepViewProps } from './StepViews.tsx';
import styles from './create.module.css';

/** The view for each step id. A new step needs an entry in WIZARD_STEPS and one here. */
const STEP_VIEWS: Record<StepId, ComponentType<StepViewProps>> = {
  names: NamesStep,
  ancestry: AncestryStep,
  lxp: LxpStep,
  skills: SkillsStep,
  items: StartingItemsStep,
  review: ReviewStep,
};

function stepAt(index: number): WizardStep {
  const step = WIZARD_STEPS[index];
  if (!step) throw new Error(`The create wizard has no step ${index + 1}.`);
  return step;
}

/**
 * `#/new`: staff create a character directly. A signed-in player builds one with the same rules
 * and sends it to staff for approval (`?edit=<id>` changes one staff sent back). `?test=1`: the
 * player's new test build (ADR 0007), saved straight away and never sent to staff.
 */
export function CreatePage() {
  const { settings } = useSettings();
  const player = useOptionalAuth()?.user;
  const [params] = useSearchParams();
  const editId = params.get('edit');
  if (PUBLIC_MODE && player)
    return (
      <Screen title="New test build">
        <div className={styles.page}>
          <h1>New test build</h1>
          <p>
            Build a character with the new character rules. It is saved in this browser only and
            never sent anywhere.
          </p>
          <Wizard
            submit={{
              user: player,
              characterId: crypto.randomUUID(),
              draft: { ...EMPTY_DRAFT, playerName: player.name },
              testBuild: true,
            }}
          />
        </div>
      </Screen>
    );
  if (settings?.mode === 'player' && player?.role === 'player' && params.get('test') === '1')
    return (
      <Screen title="New test build">
        <div className={styles.page}>
          <h1>New test build</h1>
          <p>
            Build a character with the new character rules. It is saved as your private test build
            and never goes to staff.
          </p>
          <Wizard
            submit={{
              user: player,
              // The server picks the test build's id; this one is never used.
              characterId: 'new-test-build',
              draft: asDraft({}, player),
              testBuild: true,
            }}
          />
        </div>
      </Screen>
    );
  if (settings?.mode === 'player' && player?.role === 'player')
    return (
      <Screen title="New character">
        <div className={styles.page}>
          <h1>{editId ? 'Change your character' : 'New character'}</h1>
          <p>
            Build your character with the new character rules. When you finish, it goes to staff for
            approval.
          </p>
          <PlayerWizard key={editId ?? 'new'} user={player} editId={editId} />
        </div>
      </Screen>
    );
  return (
    <Screen title="New character">
      <div className={styles.page}>
        <h1>New character</h1>
        {settings === undefined ? <p>Loading…</p> : null}
        {settings?.mode === 'player' ? (
          <>
            <p>
              Only staff can create characters. Players get their character as a file from staff and
              import it on the character list.
            </p>
            <Link to="/" className={styles.back}>
              Back to characters
            </Link>
          </>
        ) : null}
        {settings?.mode === 'staff' ? <Wizard /> : null}
      </div>
    </Screen>
  );
}

function asDraft(value: unknown, user: UserInfo): WizardDraft {
  const saved = value !== null && typeof value === 'object' ? (value as Partial<WizardDraft>) : {};
  return { ...EMPTY_DRAFT, ...saved, playerName: user.name, playerEmail: user.email };
}

/** Loads the draft of a character staff sent back, then runs the wizard in send mode. */
function PlayerWizard({ user, editId }: { user: UserInfo; editId: string | null }) {
  const [loaded, setLoaded] = useState<WizardDraft | null>(editId ? null : asDraft({}, user));
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    api
      .character(editId)
      .then((entry) => {
        if (cancelled) return;
        if (entry.meta.status === 'active') setProblem('Staff already approved this character.');
        else setLoaded(asDraft(entry.meta.draft, user));
      })
      .catch((error: unknown) => {
        if (!cancelled) setProblem(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [editId, user]);
  if (problem) return <p role="alert">{problem}</p>;
  if (!loaded) return <p>Loading…</p>;
  return <Wizard submit={{ user, characterId: editId ?? crypto.randomUUID(), draft: loaded }} />;
}

interface SubmitMode {
  user: UserInfo;
  characterId: string;
  draft: WizardDraft;
  /** Save as the player's test build (ADR 0007) instead of sending it to staff. */
  testBuild?: boolean;
}

function Wizard({ submit }: { submit?: SubmitMode }) {
  const ruleset = useRuleset();
  const navigate = useNavigate();
  const toast = useToast();
  const [characterId] = useState(() => submit?.characterId ?? crypto.randomUUID());
  const command = useCommand(characterId);
  const repository = useRepository();
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<WizardDraft>(submit?.draft ?? EMPTY_DRAFT);
  const [sendErrors, setSendErrors] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [blockedCount, setBlockedCount] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  const step = stepAt(index);
  const View = STEP_VIEWS[step.id];
  const isLast = index === WIZARD_STEPS.length - 1;
  // Errors show after a blocked Next and update live as the fields are fixed.
  const errors = attempted ? step.validate(draft, ruleset) : {};
  const messages = errorMessages(errors);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    document.documentElement.scrollTop = 0;
    headingRef.current?.focus({ preventScroll: true });
  }, [index]);

  // After a blocked Next or a failed create, bring the reasons into view.
  useEffect(() => {
    if (blockedCount === 0) return;
    const summary = summaryRef.current;
    summary?.scrollIntoView?.({ block: 'center' });
    summary?.focus({ preventScroll: true });
  }, [blockedCount]);

  function go(next: number) {
    setAttempted(false);
    command.clear();
    setSendErrors([]);
    setIndex(next);
  }

  /** Player mode: the engine checks the character here and again on the server. */
  async function send(mode: SubmitMode) {
    if (sending) return;
    const dry = dryRunCreate(draft, ruleset);
    if (!dry.ok) {
      setSendErrors(dry.errors.map((e) => e.message));
      setBlockedCount((n) => n + 1);
      return;
    }
    setSending(true);
    setSendErrors([]);
    try {
      const items = toStartingItemsCommand(draft, ruleset);
      if (PUBLIC_MODE) {
        await saveLocalTestBuild(items);
        return;
      }
      if (mode.testBuild) {
        const entry = await createTestBuild({
          from: 'scratch',
          create: toCreateCommand(draft, ruleset),
          ...(items ? { items } : {}),
        });
        void navigate(`/c/${entry.character.id}`);
        toast.show(`Made the test build ${draft.characterName.trim()}.`);
        return;
      }
      await api.submit({
        characterId: mode.characterId,
        draft,
        create: toCreateCommand(draft, ruleset),
        ...(items ? { items } : {}),
      });
      void navigate(`/c/${mode.characterId}`);
      toast.show(`Sent ${draft.characterName.trim()} to staff for approval.`);
    } catch (error) {
      setSendErrors(
        error instanceof ApiError && error.details.length > 0
          ? error.details
          : [error instanceof Error ? error.message : String(error)],
      );
      setBlockedCount((n) => n + 1);
    } finally {
      setSending(false);
    }
  }

  /**
   * The public site: no server, so the test build is planned and saved in this browser, the same
   * way staff create a character, with the same cap as the server (ADR 0007).
   */
  async function saveLocalTestBuild(items: ReturnType<typeof toStartingItemsCommand>) {
    const saved = await repository.listCharacters();
    if (saved.items.length >= TEST_BUILD_LIMIT) {
      setSendErrors([
        `You can keep up to ${TEST_BUILD_LIMIT} test builds. Delete one to make another.`,
      ]);
      setBlockedCount((n) => n + 1);
      return;
    }
    const name = draft.characterName.trim();
    const result = await command.run(toCreateCommand(draft, ruleset));
    if (!result.ok) {
      setBlockedCount((n) => n + 1);
      return;
    }
    if (items) await command.run(items);
    void navigate(`/c/${characterId}`);
    toast.show(`Made the test build ${name}.`);
  }

  async function onNext() {
    if (hasErrors(step.validate(draft, ruleset))) {
      setAttempted(true);
      setBlockedCount((n) => n + 1);
      return;
    }
    if (!isLast) {
      go(index + 1);
      return;
    }
    if (submit) {
      await send(submit);
      return;
    }
    const name = draft.characterName.trim();
    const result = await command.run(toCreateCommand(draft, ruleset), {
      success: `Created ${name}.`,
    });
    if (!result.ok) {
      setBlockedCount((n) => n + 1);
      return;
    }
    // Starting items are a separate action, saved right after the character exists.
    const items = toStartingItemsCommand(draft, ruleset);
    if (items) await command.run(items);
    void navigate(`/c/${characterId}`);
  }

  return (
    <div className={styles.wizard}>
      <p className={styles.progress}>
        Step {index + 1} of {WIZARD_STEPS.length}
      </p>
      <h2 ref={headingRef} tabIndex={-1} className={styles.stepTitle}>
        {step.title}
      </h2>
      <View
        draft={draft}
        update={setDraft}
        errors={errors}
        ruleset={ruleset}
        playerLocked={submit !== undefined && !PUBLIC_MODE}
      />
      <div ref={summaryRef} tabIndex={-1} className={styles.summaryAnchor}>
        <ErrorList
          title={
            isLast
              ? submit?.testBuild
                ? 'The test build cannot be made yet.'
                : submit
                  ? 'The character cannot be sent yet.'
                  : 'The character cannot be created yet.'
              : 'Fix this to go on:'
          }
          messages={[...messages, ...command.errors.map((e) => e.message), ...sendErrors]}
        />
      </div>
      <div className={styles.bar}>
        <div className={styles.barButtons}>
          {index > 0 ? (
            <Button variant="ghost" icon={<ArrowLeft />} onClick={() => go(index - 1)}>
              Back
            </Button>
          ) : (
            <ButtonLink to={CHARACTERS_PATH} variant="ghost">
              Cancel
            </ButtonLink>
          )}
          <Button
            variant="primary"
            icon={isLast ? submit && !submit.testBuild ? <Send /> : <Check /> : <ArrowRight />}
            aria-busy={sending}
            onClick={() => void onNext()}
          >
            {isLast
              ? submit?.testBuild
                ? 'Create test build'
                : submit
                  ? 'Send to staff'
                  : 'Create character'
              : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
