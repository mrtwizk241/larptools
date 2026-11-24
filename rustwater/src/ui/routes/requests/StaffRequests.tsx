// Staff Approvals: waiting requests grouped by player. Each player row shows how many are
// waiting; tapping it opens every request for that player's characters, to approve or reject one
// at a time or approve them all.
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { ChevronDown, CircleAlert, CircleCheck } from 'lucide-react';
import { ApiError } from '../../../api/client.ts';
import { checkRequest, plan, type Ruleset, type Sheet } from '../../../engine/index.ts';
import type { Request } from '../../../engine/model.ts';
import { Badge, Button, Card, useToast } from '../../components/index.ts';
import { publishCharacterSaved } from '../../data/characterEvents.ts';
import { useRepository, useSettings } from '../../data/hooks.ts';
import {
  pendingByPlayer,
  sheetOf,
  type CharacterRequests,
  type PlayerRequests,
} from '../../data/requests.ts';
import { rulesetFor } from '../../data/rulesetContext.ts';
import { dateText } from '../../lib/names.ts';
import { unknownRulesetMessage } from '../../data/engineHooks.ts';
import { costText } from '../character/skills/skillInfo.ts';
import { ApproveDialog, RejectDialog, type DecisionTarget } from './RequestDialogs.tsx';
import { plural, requestTitle } from './requestText.ts';
import characterStyles from '../character/character.module.css';
import styles from './requests.module.css';

interface Props {
  groups: CharacterRequests[];
  reload: () => Promise<void>;
  /** Which requests this list shows (learnings or boons). */
  filter: (request: Request) => boolean;
  /** "learning" / "boon", for counts and messages. */
  noun: { one: string; many: string };
  intro: string;
  empty: string;
}

/** Staff: waiting requests per player, opened one player at a time. */
export function StaffRequests({ groups, reload, filter, noun, intro, empty }: Props) {
  const [dialog, setDialog] = useState<(DecisionTarget & { kind: 'approve' | 'reject' }) | null>(
    null,
  );
  const players = pendingByPlayer(groups, filter);

  return (
    <>
      <p>{intro}</p>
      {players.length === 0 ? <p className={styles.muted}>{empty}</p> : null}
      {players.length > 0 ? (
        <ul className={styles.players}>
          {players.map((player) => (
            <li key={player.key}>
              <PlayerRow
                player={player}
                noun={noun}
                reload={reload}
                onDecide={(kind, target) => setDialog({ kind, ...target })}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {dialog?.kind === 'approve' ? (
        <ApproveDialog
          target={dialog}
          onClose={() => setDialog(null)}
          onDone={async () => {
            setDialog(null);
            await reload();
          }}
        />
      ) : null}
      {dialog?.kind === 'reject' ? (
        <RejectDialog
          target={dialog}
          onClose={() => setDialog(null)}
          onDone={async () => {
            setDialog(null);
            await reload();
          }}
        />
      ) : null}
    </>
  );
}

/** Approves every request of one player in order; returns what failed. */
function useApproveAll() {
  const repository = useRepository();
  const { settings } = useSettings();
  return async (player: PlayerRequests): Promise<{ done: number; failed: string[] }> => {
    let done = 0;
    const failed: string[] = [];
    for (const group of player.groups) {
      const ruleset = rulesetFor(group.character.rulesetId);
      if (!ruleset) {
        failed.push(`${group.name}: ${unknownRulesetMessage(group.character.rulesetId)}`);
        continue;
      }
      for (const { request } of group.rows) {
        const title = requestTitle(ruleset, request);
        try {
          if (repository.decideRequest) {
            const result = await repository.decideRequest(request.id, { decision: 'approve' });
            publishCharacterSaved(repository, result.character);
          } else {
            // No server (tests): plan on the stored log and save it, like useCommand.
            const stored = await repository.getCharacter(request.characterId);
            if (!stored) throw new Error('The character is gone.');
            const sheet = sheetOf(stored);
            if (!sheet) throw new Error(unknownRulesetMessage(stored.rulesetId));
            const result = plan(
              ruleset,
              sheet,
              { type: 'approveRequest', request },
              {
                actor: { role: settings?.mode ?? 'staff' },
                now: () => new Date().toISOString(),
                newId: () => crypto.randomUUID(),
                nextSeq: sheet.lastSeq + 1,
              },
            );
            if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' '));
            const saved = await repository.saveCharacter({
              ...stored,
              actions: [...stored.actions, ...result.actions],
            });
            publishCharacterSaved(repository, saved);
            await repository.saveRequest({ ...request, status: 'approved' }).catch(() => undefined);
          }
          done += 1;
        } catch (error) {
          const why =
            error instanceof ApiError && error.details.length > 0
              ? error.details.join(' ')
              : error instanceof Error
                ? error.message
                : String(error);
          failed.push(`${group.name}, ${title}: ${why}`);
        }
      }
    }
    return { done, failed };
  };
}

function PlayerRow({
  player,
  noun,
  reload,
  onDecide,
}: {
  player: PlayerRequests;
  noun: { one: string; many: string };
  reload: () => Promise<void>;
  onDecide: (kind: 'approve' | 'reject', target: DecisionTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const panelId = useId();
  const approveAll = useApproveAll();
  const toast = useToast();
  const count = plural(player.count, noun.one, noun.many);

  async function onApproveAll() {
    setBusy(true);
    setProblems([]);
    try {
      const result = await approveAll(player);
      if (result.done > 0)
        toast.show(
          `Approved ${plural(result.done, noun.one, noun.many)} for ${player.playerName}.`,
        );
      setProblems(result.failed);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.player}>
      <button
        type="button"
        className={styles.playerHead}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.playerName}>{player.playerName}</span>
        <span className={styles.playerCount}>
          <Badge kind="pending">{`${count} waiting`}</Badge>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={open ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron}
        />
      </button>
      {open ? (
        <div id={panelId} className={styles.playerBody}>
          <div className={styles.actions}>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void onApproveAll()}
              aria-label={`Approve all ${count} for ${player.playerName}`}
            >
              {busy ? 'Approving…' : `Approve all (${player.count})`}
            </Button>
          </div>
          {problems.length > 0 ? (
            <div role="alert" className={`${styles.check} ${styles.blocked}`}>
              <CircleAlert aria-hidden="true" className={styles.checkIcon} />
              <div className={styles.checkText}>
                <p>These could not be approved:</p>
                <ul>
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
          {player.groups.map((group) => (
            <StaffGroup key={group.character.id} group={group} onDecide={onDecide} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StaffGroup({
  group,
  onDecide,
}: {
  group: CharacterRequests;
  onDecide: (kind: 'approve' | 'reject', target: DecisionTarget) => void;
}) {
  const headingId = useId();
  const ruleset = rulesetFor(group.character.rulesetId);
  return (
    <section aria-labelledby={headingId} className={styles.group}>
      <h3 id={headingId} className={styles.groupName}>
        {group.name}
      </h3>
      <Link to={`/c/${group.character.id}`} className={styles.back}>
        Open {group.name}
      </Link>
      {!ruleset || !group.sheet ? (
        <p role="alert">{unknownRulesetMessage(group.character.rulesetId)}</p>
      ) : (
        <ul className={styles.list}>
          {group.rows.map(({ request }) => (
            <li key={request.id}>
              <StaffItem
                request={request}
                ruleset={ruleset}
                sheet={group.sheet as Sheet}
                onDecide={(kind) =>
                  onDecide(kind, {
                    request,
                    ruleset,
                    sheet: group.sheet as Sheet,
                    characterName: group.name,
                    title: requestTitle(ruleset, request),
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StaffItem({
  request,
  ruleset,
  sheet,
  onDecide,
}: {
  request: Request;
  ruleset: Ruleset;
  sheet: Sheet;
  onDecide: (kind: 'approve' | 'reject') => void;
}) {
  const title = requestTitle(ruleset, request);
  const check = checkRequest(ruleset, sheet, request);
  return (
    <Card title={title} headingLevel={4}>
      <div className={styles.item}>
        <p className={styles.status}>
          <Badge kind="pending" />
          <span className={styles.muted}>Asked on {dateText(request.createdAt)}</span>
        </p>
        <dl className={characterStyles.facts}>
          <div>
            <dt>{request.kind === 'boon' ? 'Given by' : 'Teacher'}</dt>
            <dd className={characterStyles.wrap}>{request.teacher || 'None named'}</dd>
          </div>
          {request.note ? (
            <div>
              <dt>Player note</dt>
              <dd className={characterStyles.text}>{request.note}</dd>
            </div>
          ) : null}
        </dl>
        {check.valid ? (
          <p className={`${styles.check} ${styles.ok}`}>
            <CircleCheck aria-hidden="true" className={styles.checkIcon} />
            <span className={styles.checkText}>
              Still valid.
              {check.cost && check.cost.amount > 0
                ? ` Costs ${costText(ruleset, check.cost)}.`
                : ''}
            </span>
          </p>
        ) : (
          <div className={`${styles.check} ${styles.blocked}`}>
            <CircleAlert aria-hidden="true" className={styles.checkIcon} />
            <div className={styles.checkText}>
              <p>
                Cannot be approved now.
                {check.cost && check.cost.amount > 0
                  ? ` Would cost ${costText(ruleset, check.cost)}.`
                  : ''}
              </p>
              <ul>
                {check.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <div className={styles.actions}>
          <Button
            variant="primary"
            aria-label={`Approve ${title}`}
            onClick={() => onDecide('approve')}
          >
            Approve
          </Button>
          <Button aria-label={`Reject ${title}`} onClick={() => onDecide('reject')}>
            Reject
          </Button>
        </div>
      </div>
    </Card>
  );
}
