import { useId, useState } from 'react';
import { Undo2 } from 'lucide-react';
import type { Ruleset } from '../../../engine/index.ts';
import type { Request } from '../../../engine/model.ts';
import { Badge, Button, Card, ConfirmDialog, useToast } from '../../components/index.ts';
import { useRepository } from '../../data/hooks.ts';
import { isPending, type CharacterRequests, type RequestRow } from '../../data/requests.ts';
import { rulesetFor, useRuleset } from '../../data/rulesetContext.ts';
import { dateText } from '../../lib/names.ts';
import { requestTitle, statusBadge } from './requestText.ts';
import characterStyles from '../character/character.module.css';
import styles from './requests.module.css';

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface Props {
  groups: CharacterRequests[];
  reload: () => Promise<void>;
}

/** Player: my learning requests per character, with staff's answer; withdraw one still waiting. */
export function PlayerRequests({ groups, reload }: Props) {
  const repository = useRepository();
  const toast = useToast();
  const [problem, setProblem] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ request: Request; title: string } | null>(
    null,
  );

  async function confirmDelete() {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    try {
      await repository.deleteRequest(target.request.id);
      await reload();
      toast.show(`Withdrew the request for ${target.title}.`);
    } catch (error) {
      setProblem(`The request could not be withdrawn: ${message(error)}`);
    }
  }

  return (
    <>
      <p>
        Learned a skill level or a Technique in game? Ask from your character’s Skills screen and
        say who taught you. Staff see it right away and approve it.
      </p>
      {problem ? (
        <p role="alert" className={styles.alert}>
          <span className={styles.alertText}>{problem}</span>
        </p>
      ) : null}
      {groups.length === 0 ? <p className={styles.muted}>No requests yet.</p> : null}
      {groups.map((group) => (
        <PlayerGroup
          key={group.character.id}
          group={group}
          onDelete={(request, title) => setPendingDelete({ request, title })}
        />
      ))}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Withdraw this request?"
        confirmLabel="Withdraw"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      >
        <p>Staff have not decided {pendingDelete?.title} yet. You can send it again later.</p>
      </ConfirmDialog>
    </>
  );
}

function PlayerGroup({
  group,
  onDelete,
}: {
  group: CharacterRequests;
  onDelete: (request: Request, title: string) => void;
}) {
  const headingId = useId();
  const fallback = useRuleset();
  const ruleset = rulesetFor(group.character.rulesetId) ?? fallback;
  return (
    <section aria-labelledby={headingId} className={styles.group}>
      <h2 id={headingId} className={styles.groupName}>
        {group.name}
      </h2>
      <ul className={styles.list}>
        {group.rows.map((row) => (
          <li key={row.request.id}>
            <PlayerItem group={group} row={row} ruleset={ruleset} onDelete={onDelete} />
          </li>
        ))}
      </ul>
    </section>
  );
}

const STATUS_NOTE = {
  draft: 'Waiting for staff',
  sent: 'Waiting for staff',
  approved: 'Added to your sheet',
  rejected: 'Not approved',
} as const;

function PlayerItem({
  group,
  row,
  ruleset,
  onDelete,
}: {
  group: CharacterRequests;
  row: RequestRow;
  ruleset: Ruleset;
  onDelete: (request: Request, title: string) => void;
}) {
  const { request, status } = row;
  const title = requestTitle(ruleset, request);
  const decision = group.sheet?.requestDecisions.find((d) => d.requestId === request.id);
  return (
    <Card title={title} headingLevel={3}>
      <div className={styles.item}>
        <p className={styles.status}>
          <Badge kind={statusBadge(status)} />
          <span className={styles.muted}>{STATUS_NOTE[status]}</span>
        </p>
        <dl className={characterStyles.facts}>
          <div>
            <dt>Teacher</dt>
            <dd className={characterStyles.wrap}>{request.teacher || 'None named'}</dd>
          </div>
          {request.note ? (
            <div>
              <dt>Note</dt>
              <dd className={characterStyles.text}>{request.note}</dd>
            </div>
          ) : null}
          <div>
            <dt>Asked on</dt>
            <dd>{dateText(request.createdAt)}</dd>
          </div>
          {status === 'rejected' && decision?.reason ? (
            <div>
              <dt>Reason</dt>
              <dd className={characterStyles.text}>{decision.reason}</dd>
            </div>
          ) : null}
        </dl>
        {isPending(status) ? (
          <div className={styles.actions}>
            <Button
              variant="ghost"
              icon={<Undo2 />}
              aria-label={`Withdraw the request for ${title}`}
              onClick={() => onDelete(request, title)}
            >
              Withdraw
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
