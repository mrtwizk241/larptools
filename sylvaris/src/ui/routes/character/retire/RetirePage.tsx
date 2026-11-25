// `#/c/:id/retire` (staff): retire the character ([RET-CHOICE], [RET-TRANSFER]) and give its
// carry-over to one character of the same player ([RET-ASSIGN]): a new one built in the create
// wizard (`#/new?retire=<id>`), or an existing one (awards of kind `retirement`, coin as an item
// owed). The retired character is read-only; the carry-over goes to one character, once.
// CharacterLayout shows players a staff-only notice instead.
import { useId, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { preview, type Ruleset } from '../../../../engine/index.ts';
import { Alert, Button, ButtonLink, Card, Dialog, Field } from '../../../components/index.ts';
import { useCommand } from '../../../data/engineHooks.ts';
import { useCharacters } from '../../../data/hooks.ts';
import { UNNAMED_CHARACTER } from '../../../data/summary.ts';
import { amountText, dateText } from '../../../lib/names.ts';
import { ErrorList } from '../ErrorList.tsx';
import type { CharacterScreen } from '../screen.tsx';
import type { CharacterView } from '../view.ts';
import {
  carryRows,
  existingCharacterCommands,
  lowStartWarning,
  newStartingXp,
  samePlayerCharacters,
  type Carry,
} from './retireModel.ts';
import styles from '../character.module.css';

/** Retirement (staff). */
export const RetirePage: CharacterScreen = ({ view }) => {
  const retired = view.sheet.retired;
  return (
    <section aria-labelledby="retire-heading" className={styles.section}>
      <h2 id="retire-heading">Retirement</h2>
      {retired ? <RetiredView view={view} /> : <RetireStart view={view} />}
    </section>
  );
};

function nameOf(view: CharacterView): string {
  return view.sheet.profile.characterName.trim() || UNNAMED_CHARACTER;
}

function CarryList({
  ruleset,
  view,
  carry,
  goodsValueCopper,
}: {
  ruleset: Ruleset;
  view: CharacterView;
  carry: Carry;
  goodsValueCopper: number;
}) {
  return (
    <dl className={styles.facts}>
      {carryRows(ruleset, view.sheet, carry, goodsValueCopper).map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>
            <span className="num">{row.value}</span>.{' '}
            <span className={styles.muted}>{row.how}.</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Not retired yet: what retiring means, and the dialog that does it. */
function RetireStart({ view }: { view: CharacterView }) {
  const [open, setOpen] = useState(false);
  const name = nameOf(view);
  return (
    <Card>
      <div className={styles.stack}>
        <p>
          Retiring makes {name} read-only. Part of the character&apos;s progress carries over to one
          character of the same player: a new character built from it, or one they already have. All
          items are turned in.
        </p>
        <div>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Retire {name}
          </Button>
        </div>
      </div>
      {open ? <RetireDialog view={view} onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}

function RetireDialog({ view, onClose }: { view: CharacterView; onClose: () => void }) {
  const formId = useId();
  const command = useCommand(view.id);
  const name = nameOf(view);
  const [goods, setGoods] = useState('0');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ goods?: string; reason?: string }>({});
  const goodsValue = /^\d+$/.test(goods.trim()) ? Number(goods.trim()) : Number.NaN;
  const valid = Number.isSafeInteger(goodsValue) && goodsValue <= 100_000_000;

  const check = useMemo(
    () =>
      preview(view.ruleset, view.sheet, {
        type: 'retireCharacter',
        reason: reason.trim() || 'preview',
        goodsValueCopper: valid ? goodsValue : 0,
      }),
    [view.ruleset, view.sheet, reason, valid, goodsValue],
  );
  const carry = check.carry;
  const warning = carry ? lowStartWarning(view.ruleset, carry) : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (command.running) return;
    const found: { goods?: string; reason?: string } = {};
    if (!valid) found.goods = 'Enter the value in Copper as a whole number, 0 or more.';
    if (reason.trim() === '') found.reason = 'Enter a reason for the retirement.';
    setErrors(found);
    if (found.goods || found.reason) return;
    const result = await command.run(
      { type: 'retireCharacter', reason: reason.trim(), goodsValueCopper: goodsValue },
      { success: `${name} is retired.` },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Retire ${name}?`}
      actions={
        <>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            aria-busy={command.running || undefined}
          >
            Retire {name}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={styles.form} onSubmit={(e) => void submit(e)}>
        <p>
          {name} becomes read-only. This cannot be undone here; a wrong retirement needs a staff
          correction of the file.
        </p>
        <Field
          label="Market value of everything owned (Copper)"
          hint="Coin, spellbooks, recipes, augments, and other items, at market prices (Q-RET-6)."
          required
          error={errors.goods}
        >
          {(control) => (
            <input
              {...control}
              inputMode="numeric"
              autoComplete="off"
              value={goods}
              onChange={(e) => setGoods(e.target.value)}
            />
          )}
        </Field>
        {carry ? (
          <div className={styles.stack}>
            <p className={styles.lead}>Carries over</p>
            <CarryList
              ruleset={view.ruleset}
              view={view}
              carry={carry}
              goodsValueCopper={valid ? goodsValue : 0}
            />
            <p>
              A new character built from it starts with{' '}
              <span className="num">{newStartingXp(view.ruleset, carry)}</span> XP and is not bound
              by the creation limits.
            </p>
            {warning ? (
              <Alert kind="info" title="Below the usual starting XP">
                <p>{warning}</p>
              </Alert>
            ) : null}
          </div>
        ) : null}
        <Field label="Reason" hint="Recorded in the log." required error={errors.reason}>
          {(control) => (
            <textarea {...control} value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </Field>
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}

/** Retired: the carry-over, and where it went or the two ways to give it. */
function RetiredView({ view }: { view: CharacterView }) {
  const retired = view.sheet.retired;
  if (!retired) return null;
  const name = nameOf(view);
  const assigned = retired.assignedTo;
  const warning = lowStartWarning(view.ruleset, retired.carry);
  return (
    <>
      <Alert kind="info" title={`${name} is retired`}>
        <p>
          Retired on {dateText(retired.at)}. Reason: {retired.reason}. The character is read-only.
        </p>
      </Alert>
      <Card title="Carry-over" headingLevel={3}>
        <div className={styles.stack}>
          <CarryList
            ruleset={view.ruleset}
            view={view}
            carry={retired.carry}
            goodsValueCopper={retired.goodsValueCopper}
          />
          {assigned ? (
            <p>
              Given to <Link to={`/c/${assigned.characterId}`}>{assigned.characterName}</Link>
              {assigned.kind === 'new' ? ', the new character built from it,' : ''} on{' '}
              {dateText(assigned.at)}. It is locked to that character.
            </p>
          ) : (
            <p>Not given to a character yet. It goes to one character, once.</p>
          )}
        </div>
      </Card>
      {assigned ? null : (
        <>
          <Card title="Build a new character" headingLevel={3}>
            <div className={styles.stack}>
              <p>
                Opens the create wizard with{' '}
                <span className="num">{newStartingXp(view.ruleset, retired.carry)}</span> starting
                XP and no creation limits. The CXP and AXP come with it, and the coin is listed as
                owed.
              </p>
              {warning ? (
                <Alert kind="info" title="Below the usual starting XP">
                  <p>{warning}</p>
                </Alert>
              ) : null}
              <div>
                <ButtonLink variant="primary" to={`/new?retire=${encodeURIComponent(view.id)}`}>
                  Build from the carry-over
                </ButtonLink>
              </div>
            </div>
          </Card>
          <GiveToExisting view={view} carry={retired.carry} />
        </>
      )}
    </>
  );
}

function GiveToExisting({ view, carry }: { view: CharacterView; carry: Carry }) {
  const characters = useCharacters();
  const name = nameOf(view);
  const candidates = useMemo(
    () =>
      characters.status === 'ready'
        ? samePlayerCharacters(
            view.ruleset,
            { id: view.id, sheet: view.sheet },
            characters.characters,
          )
        : [],
    [characters, view.ruleset, view.id, view.sheet],
  );
  const [chosen, setChosen] = useState('');
  const [confirming, setConfirming] = useState(false);
  const target = candidates.find((c) => c.id === chosen) ?? candidates[0];
  return (
    <Card title="Give to an existing character" headingLevel={3}>
      <div className={styles.stack}>
        {characters.status === 'loading' ? <p>Loading…</p> : null}
        {characters.status === 'ready' && candidates.length === 0 ? (
          <p>
            {view.sheet.profile.playerName.trim() || 'This player'} has no other active character
            (same player name or email).
          </p>
        ) : null}
        {target ? (
          <>
            <p>
              The XP, CXP, and AXP are added as retirement awards (the earned caps apply), and the
              coin is listed as owed.
            </p>
            <Field label="Character">
              {(control) => (
                <select {...control} value={target.id} onChange={(e) => setChosen(e.target.value)}>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <div>
              <Button variant="secondary" onClick={() => setConfirming(true)}>
                Give to {target.name}
              </Button>
            </div>
          </>
        ) : null}
      </div>
      {confirming && target ? (
        <GiveDialog
          view={view}
          carry={carry}
          fromName={name}
          target={target}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </Card>
  );
}

function GiveDialog({
  view,
  carry,
  fromName,
  target,
  onClose,
}: {
  view: CharacterView;
  carry: Carry;
  fromName: string;
  target: ReturnType<typeof samePlayerCharacters>[number];
  onClose: () => void;
}) {
  const give = useCommand(target.id);
  const lock = useCommand(view.id);
  const [problem, setProblem] = useState<string[]>([]);
  const commands = existingCharacterCommands(carry, fromName);
  // What the earned caps let through (Q-RET-4).
  const capped = commands.flatMap((c) => {
    if (c.type !== 'awardPoints') return [];
    const p = preview(view.ruleset, target.sheet, c);
    const kept = p.notCredited?.reduce((n, a) => n + a.amount, 0) ?? 0;
    return kept > 0
      ? [
          `${amountText(view.ruleset, c.currency, kept)} is over ${target.name}'s earned cap and is not credited.`,
        ]
      : [];
  });

  async function confirm() {
    if (give.running || lock.running) return;
    setProblem([]);
    // Lock the carry-over first, so it can never be given twice.
    const locked = await lock.run({
      type: 'assignRetirement',
      toCharacterId: target.id,
      toName: target.name,
      kind: 'existing',
    });
    if (!locked.ok) return;
    for (const command of commands) {
      const result = await give.run(command);
      if (!result.ok) {
        setProblem([
          `Part of the carry-over could not be added to ${target.name}: ${result.errors.map((e) => e.message).join(' ')} Add the rest on its Points screen.`,
        ]);
        return;
      }
    }
    give.clear();
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Give the carry-over to ${target.name}?`}
      actions={
        <>
          <Button
            variant="primary"
            aria-busy={give.running || lock.running || undefined}
            onClick={() => void confirm()}
          >
            Give to {target.name}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className={styles.stack}>
        <p>
          {fromName}&apos;s carry-over goes to {target.name} and is locked to it:{' '}
          {[
            amountText(view.ruleset, 'xp', carry.xp),
            amountText(view.ruleset, 'cxp', carry.cxp),
            amountText(view.ruleset, 'axp', carry.axp),
            `${carry.coinCopper} Copper`,
          ].join(', ')}
          .
        </p>
        {capped.length > 0 ? (
          <ul className={styles.warningList}>
            {capped.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        <ErrorList
          messages={[
            ...lock.errors.map((e) => e.message),
            ...give.errors.map((e) => e.message),
            ...problem,
          ]}
        />
      </div>
    </Dialog>
  );
}
