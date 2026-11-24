// Staff tools > Shinies: every player with the Shinies across their characters. Opening a player
// lists their characters, each with Add Shinies (a standard reason, a misc donation, or a
// staff-approved amount) and Transfer Shinies (to another character).
import { useId, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ArrowRightLeft, ChevronDown, Plus } from 'lucide-react';
import { api, ApiError } from '../../../api/client.ts';
import type { CharacterEntry, UserInfo } from '../../../api/contract.ts';
import { Button, Dialog, Field, useToast } from '../../components/index.ts';
import { publishCharacterSaved } from '../../data/characterEvents.ts';
import { useCommand } from '../../data/engineHooks.ts';
import { useRepository } from '../../data/hooks.ts';
import { useRuleset } from '../../data/rulesetContext.ts';
import { ErrorList } from '../character/ErrorList.tsx';
import { shinyPlayers, shinyReasons, type ShinyCharacter, type ShinyPlayer } from './shinies.ts';
import requestStyles from '../requests/requests.module.css';
import styles from './staff.module.css';

export function ShinyManager({
  entries,
  users,
  onChange,
}: {
  entries: CharacterEntry[] | null;
  users: UserInfo[];
  onChange: () => Promise<void>;
}) {
  const players = useMemo(() => shinyPlayers(entries ?? [], users), [entries, users]);
  const everyone = useMemo(
    () => players.flatMap((p) => p.characters.map((c) => ({ ...c, player: p.name }))),
    [players],
  );
  const [adding, setAdding] = useState<ShinyCharacter | null>(null);
  const [moving, setMoving] = useState<ShinyCharacter | null>(null);

  return (
    <section aria-labelledby="shinies-heading" className={styles.section}>
      <h2 id="shinies-heading">Shiny manager</h2>
      <p>
        Every player with the Shinies across their characters. Open a player to add Shinies to a
        character or move them to another character.
      </p>
      {entries === null ? <p>Loading…</p> : null}
      {entries !== null && players.length === 0 ? (
        <p className={styles.muted}>No players yet.</p>
      ) : null}
      <ul className={requestStyles.players}>
        {players.map((player) => (
          <li key={player.key}>
            <PlayerShinies player={player} onAdd={setAdding} onTransfer={setMoving} />
          </li>
        ))}
      </ul>
      {adding ? (
        <AddShiniesDialog
          character={adding}
          onClose={() => setAdding(null)}
          onDone={async () => {
            setAdding(null);
            await onChange();
          }}
        />
      ) : null}
      {moving ? (
        <TransferDialog
          from={moving}
          everyone={everyone}
          onClose={() => setMoving(null)}
          onDone={async () => {
            setMoving(null);
            await onChange();
          }}
        />
      ) : null}
    </section>
  );
}

function PlayerShinies({
  player,
  onAdd,
  onTransfer,
}: {
  player: ShinyPlayer;
  onAdd: (c: ShinyCharacter) => void;
  onTransfer: (c: ShinyCharacter) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className={requestStyles.player}>
      <button
        type="button"
        className={requestStyles.playerHead}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={requestStyles.playerName}>{player.name}</span>
        <span className={styles.shinyTotal}>
          <span className="num">{player.total}</span> Shinies
        </span>
        <ChevronDown
          aria-hidden="true"
          className={
            open ? `${requestStyles.chevron} ${requestStyles.chevronOpen}` : requestStyles.chevron
          }
        />
      </button>
      {open ? (
        <div id={panelId} className={requestStyles.playerBody}>
          {player.characters.length === 0 ? (
            <p className={styles.muted}>No characters yet.</p>
          ) : (
            <ul className={styles.cards}>
              {player.characters.map((c) => (
                <li key={c.id} className={styles.shinyRow}>
                  <div className={styles.shinyName}>
                    <Link to={`/c/${c.id}`}>{c.name}</Link>
                    {c.retired ? <span className={styles.muted}> (retired)</span> : null}
                  </div>
                  <div className={styles.shinyBalance}>
                    <span className="num">{c.balance}</span> Shinies
                  </div>
                  <div className={styles.actions}>
                    <Button
                      icon={<Plus />}
                      aria-label={`Add Shinies to ${c.name}`}
                      onClick={() => onAdd(c)}
                    >
                      Add Shinies
                    </Button>
                    <Button
                      icon={<ArrowRightLeft />}
                      aria-label={`Transfer Shinies from ${c.name}`}
                      onClick={() => onTransfer(c)}
                    >
                      Transfer Shinies
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function wholeNumber(text: string): number {
  const n = Number(text);
  return Number.isInteger(n) ? n : NaN;
}

function AddShiniesDialog({
  character,
  onClose,
  onDone,
}: {
  character: ShinyCharacter;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const formId = useId();
  const ruleset = useRuleset();
  const reasons = shinyReasons(ruleset);
  const command = useCommand(character.id);
  const [amount, setAmount] = useState('');
  const [reasonId, setReasonId] = useState('');
  const [detail, setDetail] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; reason?: string; detail?: string }>({});
  const reason = reasons.find((r) => r.id === reasonId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const n = wholeNumber(amount);
    const next: typeof errors = {};
    if (!(n >= 1)) next.amount = 'Enter how many Shinies to add (a whole number, 1 or more).';
    if (!reason) next.reason = 'Choose what the Shinies are for.';
    if (reason?.needsDetail && detail.trim() === '') next.detail = 'Say what they are for.';
    setErrors(next);
    if (Object.keys(next).length > 0 || !reason) return;
    const note = [reason.label, detail.trim()].filter(Boolean).join(': ');
    const result = await command.run(
      { type: 'awardPoints', currency: 'shinies', amount: n, kind: reason.kind, note },
      { success: `Added ${n} Shinies to ${character.name}.` },
    );
    if (result.ok) await onDone();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Add Shinies to ${character.name}`}
      actions={
        <>
          <Button variant="primary" type="submit" form={formId}>
            Add Shinies
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={styles.form} onSubmit={(e) => void submit(e)}>
        <Field label="How many Shinies?" required error={errors.amount}>
          {(control) => (
            <input
              {...control}
              type="number"
              inputMode="numeric"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
        </Field>
        <fieldset className={styles.radios}>
          <legend>What for?</legend>
          {errors.reason ? (
            <p className={styles.error} role="alert">
              {errors.reason}
            </p>
          ) : null}
          {reasons.map((r) => (
            <label key={r.id} className={styles.radio}>
              <input
                type="radio"
                name={`${formId}-reason`}
                value={r.id}
                checked={reasonId === r.id}
                onChange={() => setReasonId(r.id)}
              />
              <span>
                {r.label}
                {r.hint ? <span className={styles.note}>{` (${r.hint})`}</span> : null}
              </span>
            </label>
          ))}
        </fieldset>
        <Field
          label="Details"
          hint={
            reason?.needsDetail
              ? 'Required: what was donated or what the amount is for.'
              : 'Optional: for example the plot, the event, or the hours.'
          }
          required={reason?.needsDetail === true}
          error={errors.detail}
        >
          {(control) => (
            <input
              {...control}
              autoComplete="off"
              maxLength={500}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            />
          )}
        </Field>
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}

function TransferDialog({
  from,
  everyone,
  onClose,
  onDone,
}: {
  from: ShinyCharacter;
  everyone: (ShinyCharacter & { player: string })[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const formId = useId();
  const repository = useRepository();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [toId, setToId] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; to?: string }>({});
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const targets = everyone.filter((c) => c.id !== from.id && !c.retired);
  const to = targets.find((c) => c.id === toId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const n = wholeNumber(amount);
    const next: typeof errors = {};
    if (!(n >= 1)) next.amount = 'Enter how many Shinies to move (a whole number, 1 or more).';
    else if (n > from.balance) next.amount = `${from.name} has ${from.balance} Shinies.`;
    if (!to) next.to = 'Choose the character to give them to.';
    setErrors(next);
    if (Object.keys(next).length > 0 || !to) return;
    setBusy(true);
    setProblems([]);
    try {
      const result = await api.transferShinies({
        fromId: from.id,
        toId: to.id,
        amount: n,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      publishCharacterSaved(repository, result.from.character);
      publishCharacterSaved(repository, result.to.character);
      toast.show(`Moved ${n} Shinies from ${from.name} to ${to.name}.`);
      await onDone();
    } catch (error) {
      setProblems(
        error instanceof ApiError && error.details.length > 0
          ? error.details
          : [error instanceof Error ? error.message : String(error)],
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Transfer Shinies from ${from.name}`}
      actions={
        <>
          <Button variant="primary" type="submit" form={formId} disabled={busy}>
            Transfer
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={styles.form} onSubmit={(e) => void submit(e)}>
        <p>
          {from.name} has <span className="num">{from.balance}</span> Shinies.
        </p>
        <Field label="How many Shinies?" required error={errors.amount}>
          {(control) => (
            <input
              {...control}
              type="number"
              inputMode="numeric"
              min={1}
              max={from.balance}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
        </Field>
        <Field label="Give them to" required error={errors.to}>
          {(control) => (
            <select {...control} value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">Choose a character</option>
              {targets.map((c) => (
                <option key={c.id} value={c.id}>
                  {`${c.name} (${c.player}, ${c.balance} Shinies)`}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Note" hint="Optional: why the Shinies moved.">
          {(control) => (
            <input
              {...control}
              autoComplete="off"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>
        <ErrorList messages={problems} />
      </form>
    </Dialog>
  );
}
