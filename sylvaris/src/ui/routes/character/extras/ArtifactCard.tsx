// The Artifact: awaken at 500 XP earned, unlock slots with AXP, set powers by tier with their
// choice, and remove powers once a calendar year ([ART-RULES]).
import { useId, useMemo, useState, type FormEvent } from 'react';
import { CircleCheck, CircleX } from 'lucide-react';
import { type ArtifactSection } from '../../../../engine/index.ts';
import { Button, Card, Dialog, Field } from '../../../components/index.ts';
import { previewCommand, type CommandApi, useCommand } from '../../../data/engineHooks.ts';
import { ErrorList } from '../ErrorList.tsx';
import type { CharacterView } from '../view.ts';
import { matches } from '../journals/journalModel.ts';
import {
  awakenLines,
  nextSlotText,
  powerChoiceOptions,
  powerName,
  removalUsed,
  slotsText,
} from './extrasModel.ts';
import shared from '../character.module.css';
import styles from '../journals/screens.module.css';
import { LOCAL_MODE } from '../../../../localMode.ts';
import { PLAYGROUND_REASON } from '../playground.ts';

type Open = 'awaken' | 'power' | 'remove' | null;

export function ArtifactCard({ view }: { view: CharacterView }) {
  const { ruleset, sheet, isStaff } = view;
  const command = useCommand(view.id);
  const [open, setOpen] = useState<Open>(null);
  const a = sheet.artifact;
  const show = (o: Open) => {
    command.clear();
    setOpen(o);
  };
  const close = () => {
    command.clear();
    setOpen(null);
  };

  return (
    <Card title="Artifact" className={`${shared.card} ${styles.wide}`}>
      <div className={shared.stack}>
        {a ? (
          <ArtifactDetails view={view} a={a} command={command} onOpen={show} />
        ) : (
          <>
            <p>No Artifact yet.</p>
            {awakenLines(ruleset, sheet).map((line) => (
              <p
                key={line.text}
                className={`${styles.status} ${line.met ? styles.ok : styles.blocked}`}
              >
                {line.met ? (
                  <CircleCheck aria-hidden="true" className={styles.statusIcon} />
                ) : (
                  <CircleX aria-hidden="true" className={styles.statusIcon} />
                )}
                <span>{line.text}</span>
              </p>
            ))}
            {isStaff ? (
              <div className={styles.actions}>
                <AwakenButton view={view} onOpen={() => show('awaken')} />
              </div>
            ) : null}
          </>
        )}
        {open === null ? <ErrorList messages={command.errors.map((e) => e.message)} /> : null}
      </div>
      {open === 'awaken' ? <AwakenDialog view={view} command={command} onClose={close} /> : null}
      {open === 'power' && a ? (
        <PowerDialog view={view} a={a} command={command} onClose={close} />
      ) : null}
      {open === 'remove' && a ? (
        <RemoveDialog view={view} a={a} command={command} onClose={close} />
      ) : null}
    </Card>
  );
}

function AwakenButton({ view, onOpen }: { view: CharacterView; onOpen: () => void }) {
  const check = previewCommand(view.ruleset, view.sheet, {
    type: 'awakenArtifact',
    name: 'Artifact',
  });
  return (
    <Button
      variant="primary"
      disabled={!check.allowed}
      disabledReason={check.reasons.join(' ')}
      onClick={onOpen}
    >
      {`Awaken an Artifact (${view.ruleset.ruleset.artifact.awakenCostAxp} AXP)`}
    </Button>
  );
}

function ArtifactDetails({
  view,
  a,
  command,
  onOpen,
}: {
  view: CharacterView;
  a: ArtifactSection;
  command: CommandApi;
  onOpen: (o: Open) => void;
}) {
  const { ruleset, sheet, isStaff } = view;
  const unlock = previewCommand(ruleset, sheet, { type: 'unlockArtifactSlot' });
  const year = new Date().toISOString().slice(0, 4);
  // The no-login builder takes powers off any time.
  const removed = !LOCAL_MODE && removalUsed(ruleset, a, year);
  return (
    <>
      <p className={shared.lead}>{a.name}</p>
      {a.description ? <p className={shared.text}>{a.description}</p> : null}
      <dl className={styles.numbers}>
        <div className={styles.number}>
          <dt>Slots used</dt>
          <dd>{a.slotsUsed}</dd>
        </div>
        <div className={styles.number}>
          <dt>Slots free</dt>
          <dd>{a.slotsFree}</dd>
        </div>
        <div className={styles.number}>
          <dt>Unlocked</dt>
          <dd>
            {a.slotsUnlocked} of {a.maxSlots}
          </dd>
        </div>
      </dl>
      <p className={shared.muted}>
        {slotsText(a)} {nextSlotText(a)}
      </p>
      {a.powers.length === 0 ? (
        <p>No powers set yet.</p>
      ) : (
        <ul className={styles.items} aria-label="Artifact powers">
          {a.powers.map((p) => (
            <li key={p.entryId} className={styles.item}>
              <div className={styles.itemHead}>
                <h3 className={styles.itemName}>
                  {powerName(ruleset, p.powerId)}
                  {p.choice ? `: ${p.choice}` : ''}
                </h3>
                <span className={styles.meta}>
                  Tier {p.tier}, {p.tier === 1 ? '1 slot' : `${p.tier} slots`}
                </span>
              </div>
              <p className={shared.text}>{p.summary}</p>
            </li>
          ))}
        </ul>
      )}
      {a.removals.length > 0 ? (
        <p className={shared.muted}>
          Last removal: {a.removals.at(-1)?.at.slice(0, 10)}. Reason: {a.removals.at(-1)?.reason}
        </p>
      ) : null}
      {isStaff ? (
        <div className={styles.actions}>
          <Button
            variant="primary"
            disabled={a.slotsFree === 0}
            disabledReason="No free slot. Unlock one first."
            onClick={() => onOpen('power')}
          >
            Set a power
          </Button>
          {a.nextSlotCost !== null ? (
            <Button
              variant="secondary"
              disabled={!unlock.allowed}
              disabledReason={unlock.reasons.join(' ')}
              onClick={() =>
                void command.run(
                  { type: 'unlockArtifactSlot' },
                  { success: `Unlocked slot ${a.slotsUnlocked + 1}.` },
                )
              }
            >
              {`Unlock a slot (${a.nextSlotCost} AXP)`}
            </Button>
          ) : null}
          {a.powers.length > 0 ? (
            <Button
              variant="ghost"
              disabled={removed}
              disabledReason={`Powers were already removed in ${year}. Once per calendar year.`}
              onClick={() => onOpen('remove')}
            >
              Remove powers
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function AwakenDialog({
  view,
  command,
  onClose,
}: {
  view: CharacterView;
  command: CommandApi;
  onClose: () => void;
}) {
  const formId = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (command.running) return;
    const n = name.trim();
    if (!n) return setError('Name the Artifact.');
    setError('');
    const d = description.trim();
    const result = await command.run(
      { type: 'awakenArtifact', name: n, ...(d ? { description: d } : {}) },
      { success: `${n} is awakened.` },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Awaken an Artifact"
      actions={
        <>
          <Button variant="primary" type="submit" form={formId}>
            Awaken
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={shared.form} onSubmit={(e) => void submit(e)}>
        <p>
          Costs {view.ruleset.ruleset.artifact.awakenCostAxp} AXP and opens the first slot. One
          Artifact per character.
        </p>
        <Field label="Name" required error={error}>
          {(control) => (
            <input
              {...control}
              value={name}
              maxLength={200}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label="Description">
          {(control) => (
            <textarea
              {...control}
              value={description}
              maxLength={2000}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}

function PowerDialog({
  view,
  a,
  command,
  onClose,
}: {
  view: CharacterView;
  a: ArtifactSection;
  command: CommandApi;
  onClose: () => void;
}) {
  const { ruleset } = view;
  const formId = useId();
  const [tier, setTier] = useState(String(Math.min(a.slotsFree, 1)));
  const [query, setQuery] = useState('');
  const [powerId, setPowerId] = useState('');
  const [choice, setChoice] = useState('');
  const [error, setError] = useState('');
  const tiers = [1, 2, 3, 4, 5].filter((t) => t <= a.slotsFree);
  const powers = useMemo(
    () =>
      ruleset.artifacts.powers.filter(
        (p) => String(p.tier) === tier && matches(query, powerName(ruleset, p.id), p.summary),
      ),
    [ruleset, tier, query],
  );
  const power = powerId ? ruleset.artifactPowersById[powerId] : undefined;
  const options = power ? powerChoiceOptions(ruleset, power.id) : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (command.running) return;
    if (!power) return setError('Choose a power.');
    if (power.choice && !choice.trim()) return setError(`Name the ${power.choice}.`);
    setError('');
    const c = choice.trim();
    const result = await command.run(
      { type: 'setArtifactPower', powerId: power.id, ...(c ? { choice: c } : {}) },
      { success: `${powerName(ruleset, power.id)} is set.` },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Set a power"
      actions={
        <>
          <Button variant="primary" type="submit" form={formId}>
            Set power
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={shared.form} onSubmit={(e) => void submit(e)}>
        <p>
          {a.slotsFree === 1 ? '1 slot is free.' : `${a.slotsFree} slots are free.`} A power fills
          as many slots as its tier.
        </p>
        <Field label="Tier">
          {(control) => (
            <select
              {...control}
              value={tier}
              onChange={(e) => {
                setTier(e.target.value);
                setPowerId('');
                setChoice('');
              }}
            >
              {tiers.map((t) => (
                <option key={t} value={String(t)}>
                  Tier {t}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Search">
          {(control) => (
            <input
              {...control}
              type="search"
              value={query}
              autoComplete="off"
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
        </Field>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Power</legend>
          <p className={styles.count} aria-live="polite">
            {powers.length === 0 ? 'No power matches.' : `${powers.length} to choose from.`}
          </p>
          <ul className={styles.options}>
            {powers.map((p) => (
              <PowerOption
                key={p.id}
                id={p.id}
                name={powerName(ruleset, p.id)}
                detail={`${p.summary}${p.gmApproval ? ' Needs GM approval.' : ''} ${p.source}.`}
                group={`${formId}-power`}
                checked={p.id === powerId}
                onSelect={() => {
                  setPowerId(p.id);
                  setChoice('');
                  setError('');
                  command.clear();
                }}
              />
            ))}
          </ul>
        </fieldset>
        {power?.choice ? (
          options ? (
            <Field label={`Choose the ${power.choice}`} required>
              {(control) => (
                <select {...control} value={choice} onChange={(e) => setChoice(e.target.value)}>
                  <option value="">Choose</option>
                  {options.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ) : (
            <Field label={`Name the ${power.choice}`} required>
              {(control) => (
                <input
                  {...control}
                  value={choice}
                  maxLength={200}
                  autoComplete="off"
                  onChange={(e) => setChoice(e.target.value)}
                />
              )}
            </Field>
          )
        ) : null}
        <ErrorList
          messages={[...(error ? [error] : []), ...command.errors.map((e) => e.message)]}
        />
      </form>
    </Dialog>
  );
}

function PowerOption({
  id,
  name,
  detail,
  group,
  checked,
  onSelect,
}: {
  id: string;
  name: string;
  detail: string;
  group: string;
  checked: boolean;
  onSelect: () => void;
}) {
  const inputId = useId();
  return (
    <li className={styles.option}>
      <input
        id={inputId}
        type="radio"
        name={group}
        value={id}
        checked={checked}
        onChange={onSelect}
        className={styles.radio}
        aria-describedby={`${inputId}-detail`}
      />
      <span className={styles.optionText}>
        <label htmlFor={inputId} className={styles.optionLabel}>
          {name}
        </label>
        <span id={`${inputId}-detail`} className={styles.optionDetail}>
          {detail}
        </span>
      </span>
    </li>
  );
}

function RemoveDialog({
  view,
  a,
  command,
  onClose,
}: {
  view: CharacterView;
  a: ArtifactSection;
  command: CommandApi;
  onClose: () => void;
}) {
  const formId = useId();
  const [picked, setPicked] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (command.running) return;
    if (picked.length === 0) return setError('Choose the powers to remove.');
    const why = LOCAL_MODE ? PLAYGROUND_REASON : reason.trim();
    if (!why) return setError('Give a reason.');
    setError('');
    const result = await command.run(
      { type: 'removeArtifactPowers', entryIds: picked, reason: why },
      { success: picked.length === 1 ? 'Removed 1 power.' : `Removed ${picked.length} powers.` },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Remove powers"
      actions={
        <>
          <Button variant="danger" type="submit" form={formId}>
            Remove powers
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={shared.form} onSubmit={(e) => void submit(e)}>
        {LOCAL_MODE ? null : (
          <p>Powers can be removed once per calendar year, any number at once.</p>
        )}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Powers</legend>
          {a.powers.map((p) => (
            <label key={p.entryId} className={styles.checkRow}>
              <input
                type="checkbox"
                checked={picked.includes(p.entryId)}
                onChange={(e) =>
                  setPicked((list) =>
                    e.target.checked ? [...list, p.entryId] : list.filter((id) => id !== p.entryId),
                  )
                }
              />
              <span>
                {powerName(view.ruleset, p.powerId)}
                {p.choice ? `: ${p.choice}` : ''} (Tier {p.tier})
              </span>
            </label>
          ))}
        </fieldset>
        {LOCAL_MODE ? null : (
          <Field label="Reason" required>
            {(control) => (
              <input
                {...control}
                value={reason}
                maxLength={2000}
                autoComplete="off"
                onChange={(e) => setReason(e.target.value)}
              />
            )}
          </Field>
        )}
        <ErrorList
          messages={[...(error ? [error] : []), ...command.errors.map((e) => e.message)]}
        />
      </form>
    </Dialog>
  );
}
