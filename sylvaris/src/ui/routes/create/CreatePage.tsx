// `#/new`: the create wizard. Staff create the character directly through the rules engine; a
// player builds one with the same rules and sends it to staff for approval (`?edit=<id>` changes
// one staff sent back). Staff build a character from a retirement carry-over with
// `?retire=<retired id>` ([RET-REBUILD]): the carry-over is the starting XP, the creation limits do
// not apply, and the retired character records where its carry-over went. The draft is kept on
// this device so a reload does not lose it.
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, Check, Send } from 'lucide-react';
import { ApiError, api } from '../../../api/client.ts';
import type { UserInfo } from '../../../api/contract.ts';
import { useOptionalAuth } from '../../auth/authContext.ts';
import { Button, ButtonLink, useToast } from '../../components/index.ts';
import { useCommand, useSheet } from '../../data/engineHooks.ts';
import { useRepository, useSettings } from '../../data/hooks.ts';
import { CHARACTERS_PATH, PUBLIC_MODE, TEST_BUILD_LIMIT } from '../../../publicMode.ts';
import { useRuleset } from '../../data/rulesetContext.ts';
import { Screen } from '../../Screen.tsx';
import { ErrorList } from '../character/ErrorList.tsx';
import { clearWizard, draftKey, loadWizard, saveWizard } from './draftStore.ts';
import { ItemsStep } from './ItemsStep.tsx';
import { SkillsStep } from './SkillsStep.tsx';
import {
  BackstoryStep,
  ProfileStep,
  RaceStep,
  ReviewStep,
  type StepViewProps,
} from './StepViews.tsx';
import {
  EMPTY_DRAFT,
  NO_ERRORS,
  WIZARD_STEPS,
  asDraft,
  dryRun,
  errorMessages,
  hasErrors,
  staffCommands,
  toSubmission,
  type Player,
  type RetirementSource,
  type StepId,
  type WizardDraft,
} from './steps.ts';
import styles from './create.module.css';

const STEP_VIEWS: Record<StepId, ComponentType<StepViewProps>> = {
  profile: ProfileStep,
  race: RaceStep,
  skills: SkillsStep,
  items: ItemsStep,
  backstory: BackstoryStep,
  review: ReviewStep,
};

export function CreatePage() {
  const { settings } = useSettings();
  const user = useOptionalAuth()?.user ?? null;
  const [params] = useSearchParams();
  const editId = params.get('edit');
  const retireId = params.get('retire');
  const isPlayer = settings?.mode === 'player';
  const isStaff = settings?.mode === 'staff';
  if (PUBLIC_MODE)
    return (
      <Screen title="New test build">
        <div className={styles.page}>
          <h1>New test build</h1>
          <p>
            Build a character with the new character rules. It is saved in this browser only and
            never sent anywhere.
          </p>
          {settings === undefined ? <p>Loading…</p> : <Wizard storageKey={draftKey(user?.id)} />}
        </div>
      </Screen>
    );
  return (
    <Screen title="New character">
      <div className={styles.page}>
        <h1>
          {editId && isPlayer
            ? 'Change your character'
            : retireId && isStaff
              ? 'New character from a retirement'
              : 'New character'}
        </h1>
        {settings === undefined ? <p>Loading…</p> : null}
        {isPlayer && user ? (
          <>
            <p>
              Build your character with the new character rules. When you finish, it goes to staff
              for approval.
            </p>
            <PlayerWizard key={editId ?? 'new'} user={user} editId={editId} />
          </>
        ) : null}
        {isStaff && retireId ? (
          <RetirementWizard key={retireId} retiredId={retireId} accountId={user?.id} />
        ) : null}
        {isStaff && !retireId ? <Wizard storageKey={draftKey(user?.id)} /> : null}
      </div>
    </Screen>
  );
}

/** Loads the draft of a character staff sent back, then runs the wizard in send mode. */
function PlayerWizard({ user, editId }: { user: UserInfo; editId: string | null }) {
  const [loaded, setLoaded] = useState<WizardDraft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!editId) return undefined;
    let cancelled = false;
    api
      .character(editId)
      .then((entry) => {
        if (cancelled) return;
        if (entry.meta.status === 'active') setProblem('Staff already approved this character.');
        else setLoaded(asDraft(entry.meta.draft));
      })
      .catch((error: unknown) => {
        if (!cancelled) setProblem(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [editId]);
  const player: Player = { name: user.name, email: user.email };
  if (!editId) return <Wizard player={player} storageKey={draftKey(user.id)} />;
  if (problem) return <p role="alert">{problem}</p>;
  if (!loaded) return <p>Loading…</p>;
  return (
    <Wizard
      player={player}
      storageKey={`${draftKey(user.id)}.${editId}`}
      initial={{ draft: loaded, characterId: editId }}
    />
  );
}

/** Staff: the wizard in retirement mode, for a retired character whose carry-over is not given. */
function RetirementWizard({
  retiredId,
  accountId,
}: {
  retiredId: string;
  accountId: string | undefined;
}) {
  const state = useSheet(retiredId);
  if (state.status === 'loading') return <p>Loading…</p>;
  if (state.status !== 'ready')
    return (
      <p role="alert">
        {state.status === 'error' ? state.message : 'There is no retired character at this link.'}
      </p>
    );
  const { sheet } = state;
  const name = sheet.profile.characterName.trim() || 'the retired character';
  if (!sheet.retired) return <p role="alert">{name} is not retired. Retire it first.</p>;
  if (sheet.retired.assignedTo)
    return (
      <p role="alert">
        The carry-over of {name} already went to {sheet.retired.assignedTo.characterName}.
      </p>
    );
  const retirement: RetirementSource = {
    characterId: retiredId,
    fromName: name,
    ...sheet.retired.carry,
  };
  return (
    <Wizard
      storageKey={`${draftKey(accountId)}.retire-${retiredId}`}
      retirement={retirement}
      initial={{
        draft: {
          ...EMPTY_DRAFT,
          playerName: sheet.profile.playerName,
          playerEmail: sheet.profile.playerEmail ?? '',
          retirement,
        },
      }}
    />
  );
}

function Wizard({
  player,
  storageKey,
  initial,
  retirement,
}: {
  /** Send mode: a player sends the character to staff. */
  player?: Player;
  storageKey: string;
  /** A sent-back character (its saved answers and id), or the first answers. */
  initial?: { draft: WizardDraft; characterId?: string };
  /** Retirement mode (staff): the carry-over the character is built from. */
  retirement?: RetirementSource;
}) {
  const ruleset = useRuleset();
  const navigate = useNavigate();
  const toast = useToast();
  const [saved] = useState(() => loadWizard(storageKey));
  const [characterId] = useState(
    () => initial?.characterId ?? saved?.characterId ?? crypto.randomUUID(),
  );
  const command = useCommand(characterId);
  // Retirement mode: the retired character records where its carry-over went.
  const lock = useCommand(retirement?.characterId ?? characterId);
  const repository = useRepository();
  const [index, setIndex] = useState(() => Math.min(saved?.step ?? 0, WIZARD_STEPS.length - 1));
  const [draft, setDraft] = useState<WizardDraft>(() => {
    const base = saved?.draft ?? initial?.draft ?? EMPTY_DRAFT;
    // The carry-over always comes from the retired character, never from an old saved copy.
    return { ...base, retirement: retirement ?? null };
  });
  const [sendErrors, setSendErrors] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [blockedCount, setBlockedCount] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const finished = useRef(false);

  const step = WIZARD_STEPS[index] ?? WIZARD_STEPS[0]!;
  const View = STEP_VIEWS[step.id];
  const isLast = index === WIZARD_STEPS.length - 1;
  const ctx = { playerLocked: player !== undefined };
  // Errors show after a blocked Next and update live as the fields are fixed.
  const errors = attempted ? step.validate(draft, ruleset, ctx) : NO_ERRORS;
  const messages = errorMessages(errors);

  useEffect(() => {
    if (finished.current) return;
    saveWizard(storageKey, { draft, step: index, characterId: player ? characterId : null });
  }, [storageKey, draft, index, characterId, player]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    document.documentElement.scrollTop = 0;
    headingRef.current?.focus({ preventScroll: true });
  }, [index]);

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

  function done() {
    finished.current = true;
    clearWizard(storageKey);
  }

  async function send(who: Player) {
    if (sending) return;
    setSending(true);
    setSendErrors([]);
    try {
      await api.submit(toSubmission(draft, ruleset, characterId, who));
      done();
      void navigate(`/c/${characterId}`);
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

  async function create() {
    const name = draft.characterName.trim();
    // The public site keeps at most TEST_BUILD_LIMIT test builds in one browser.
    if (PUBLIC_MODE) {
      const saved = await repository.listCharacters();
      if (saved.items.length >= TEST_BUILD_LIMIT) {
        setSendErrors([
          `You can keep up to ${TEST_BUILD_LIMIT} test builds. Delete one to make another.`,
        ]);
        setBlockedCount((n) => n + 1);
        return;
      }
    }
    const commands = staffCommands(draft, ruleset);
    for (const [i, cmd] of commands.entries()) {
      // The first command makes a new character: nothing to fetch for this id yet.
      const result = await command.run(
        cmd,
        i === 0 ? { success: `Created ${name}.`, isNew: true } : {},
      );
      if (!result.ok) {
        setBlockedCount((n) => n + 1);
        // After the character exists, a later problem is fixed on the character's screens.
        if (i > 0) {
          done();
          void navigate(`/c/${characterId}`);
        }
        return;
      }
    }
    if (retirement) {
      const locked = await lock.run({
        type: 'assignRetirement',
        toCharacterId: characterId,
        toName: name,
        kind: 'new',
      });
      if (!locked.ok)
        toast.show(
          `${name} was created, but ${retirement.fromName} could not record where its carry-over went: ${locked.errors.map((e) => e.message).join(' ')}`,
        );
    }
    done();
    void navigate(`/c/${characterId}`);
  }

  async function onNext() {
    if (hasErrors(step.validate(draft, ruleset, ctx))) {
      setAttempted(true);
      setBlockedCount((n) => n + 1);
      return;
    }
    if (!isLast) {
      go(index + 1);
      return;
    }
    const dry = dryRun(draft, ruleset);
    if (!dry.ok) {
      setSendErrors(dry.errors.map((e) => e.message));
      setBlockedCount((n) => n + 1);
      return;
    }
    if (player) await send(player);
    else await create();
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
        player={player ?? null}
      />
      <div ref={summaryRef} tabIndex={-1} className={styles.summaryAnchor}>
        <ErrorList
          title={
            isLast
              ? player
                ? 'The character cannot be sent yet.'
                : PUBLIC_MODE
                  ? 'The test build cannot be made yet.'
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
            icon={isLast ? player ? <Send /> : <Check /> : <ArrowRight />}
            aria-busy={sending || command.running}
            onClick={() => void onNext()}
          >
            {isLast
              ? player
                ? 'Send to staff'
                : PUBLIC_MODE
                  ? 'Create test build'
                  : 'Create character'
              : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
