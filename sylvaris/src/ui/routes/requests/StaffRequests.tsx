import { useId, useState } from 'react';
import { Link } from 'react-router';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { checkRequest, type Ruleset, type Sheet } from '../../../engine/index.ts';
import type { Request } from '../../../engine/model.ts';
import { Badge, Button, Card } from '../../components/index.ts';
import { isPending, type CharacterRequests } from '../../data/requests.ts';
import { rulesetFor } from '../../data/rulesetContext.ts';
import { costText, dateText } from '../../lib/names.ts';
import { unknownRulesetMessage } from '../../data/engineHooks.ts';
import { ApproveDialog, RejectDialog, type DecisionTarget } from './RequestDialogs.tsx';
import { requestTitle } from './requestText.ts';
import characterStyles from '../character/character.module.css';
import styles from './requests.module.css';

interface Props {
  groups: CharacterRequests[];
  reload: () => Promise<void>;
}

/** Staff: approve or reject each skill a player says they learned. */
export function StaffRequests({ groups, reload }: Props) {
  const [dialog, setDialog] = useState<(DecisionTarget & { kind: 'approve' | 'reject' }) | null>(
    null,
  );

  const pending = groups
    .map((g) => ({ ...g, rows: g.rows.filter((r) => isPending(r.status)) }))
    .filter((g) => g.rows.length > 0);

  return (
    <>
      <p>
        Skill levels and Techniques players say they learned, with who taught them. Approving
        records them in the Log of Learning with the cost and the teacher.
      </p>
      {pending.length === 0 ? <p className={styles.muted}>No learnings waiting.</p> : null}
      {pending.map((group) => (
        <StaffGroup
          key={group.character.id}
          group={group}
          onDecide={(kind, target) => setDialog({ kind, ...target })}
        />
      ))}
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
      <h2 id={headingId} className={styles.groupName}>
        {group.name}
      </h2>
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
    <Card title={title} headingLevel={3}>
      <div className={styles.item}>
        <p className={styles.status}>
          <Badge kind="pending" />
          <span className={styles.muted}>Asked on {dateText(request.createdAt)}</span>
        </p>
        <dl className={characterStyles.facts}>
          <div>
            <dt>Teacher</dt>
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
              Still valid.{check.cost ? ` Costs ${costText(ruleset, check.cost)}.` : ''}
            </span>
          </p>
        ) : (
          <div className={`${styles.check} ${styles.blocked}`}>
            <CircleAlert aria-hidden="true" className={styles.checkIcon} />
            <div className={styles.checkText}>
              <p>
                Cannot be approved now.
                {check.cost ? ` Would cost ${costText(ruleset, check.cost)}.` : ''}
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
