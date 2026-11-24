import { useId, useState, type FormEvent } from 'react';
import { preview, type FamiliarSection, type FamiliarSkillView } from '../../../../engine/index.ts';
import {
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  Field,
  LevelStepper,
} from '../../../components/index.ts';
import { useCommand, type CommandApi } from '../../../data/engineHooks.ts';
import { ChoiceCard } from '../../create/ChoiceCard.tsx';
import { ErrorList } from '../ErrorList.tsx';
import { frequencyText } from '../format.ts';
import { canRequest } from '../skills/requestParts.ts';
import type { CharacterView } from '../view.ts';
import shared from '../character.module.css';
import create from '../../create/create.module.css';
import styles from '../profession/profession.module.css';

/**
 * Players (on their own approved character) and staff may name the familiar and spend FP and
 * Essence on it: these need no teacher or approval. Breaking the bond stays with staff.
 */
function canSpend(view: CharacterView): boolean {
  return view.isStaff || canRequest(view);
}

/** Familiar: bond, name, awaken, level, Essence skills, slots, and breaking the bond. */
export function FamiliarCard({ view }: { view: CharacterView }) {
  const command = useCommand(view.id);
  const [bonding, setBonding] = useState(false);
  const fam = view.sheet.familiar;
  return (
    <Card title="Familiar" className={`${shared.card} ${styles.wide}`}>
      {fam ? (
        <Bonded view={view} fam={fam} command={command} />
      ) : (
        <div className={shared.stack}>
          <p>No familiar bonded.</p>
          {canSpend(view) ? (
            <>
              <p className={shared.muted}>
                FP available: <span className="num">{view.sheet.points.fp.available}</span>. Bonding
                costs no FP.
              </p>
              <div className={styles.actions}>
                <Button variant="primary" onClick={() => setBonding(true)}>
                  Bond a familiar
                </Button>
              </div>
            </>
          ) : null}
        </div>
      )}
      {bonding ? <BondDialog command={command} onClose={() => setBonding(false)} /> : null}
    </Card>
  );
}

function Bonded({
  view,
  fam,
  command,
}: {
  view: CharacterView;
  fam: FamiliarSection;
  command: CommandApi;
}) {
  const { ruleset, sheet, isStaff } = view;
  const edit = canSpend(view);
  const [dialog, setDialog] = useState<'awaken' | 'learn' | 'break' | 'rename' | null>(null);
  const [forgetting, setForgetting] = useState<FamiliarSkillView | null>(null);
  const max = ruleset.familiar.levels.max;
  const unlock = preview(ruleset, sheet, { type: 'unlockFamiliarSlot' });
  const forgetFp = ruleset.familiar.familiarPoints.spend.forgetSkill;
  const close = () => {
    setDialog(null);
    command.clear();
  };

  async function forget(skill: FamiliarSkillView) {
    setForgetting(null);
    await command.run(
      { type: 'forgetFamiliarSkill', learnedActionId: skill.actionId },
      { success: `${fam.name} forgot ${skill.name}.` },
    );
  }

  async function breakBond() {
    setDialog(null);
    await command.run(
      { type: 'breakFamiliarBond' },
      { success: `The bond with ${fam.name} is broken.` },
    );
  }

  return (
    <div className={shared.stack}>
      <dl className={shared.facts}>
        <div>
          <dt>Name</dt>
          <dd className={shared.wrap}>
            {fam.name}
            {fam.creature ? `, ${fam.creature}` : ''}
            {edit ? (
              <>
                {' '}
                <Button variant="ghost" onClick={() => setDialog('rename')}>
                  Rename
                </Button>
              </>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Level</dt>
          <dd>
            {edit && fam.awakened ? (
              <LevelSteps view={view} fam={fam} command={command} />
            ) : (
              <>
                <span className="num">{fam.level}</span> of <span className="num">{max}</span>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>FP available</dt>
          <dd className="num">{sheet.points.fp.available}</dd>
        </div>
        <div>
          <dt>Essence</dt>
          <dd>
            <span className="num">{fam.essence.available}</span> available of{' '}
            <span className="num">{fam.essence.total}</span> (
            <span className="num">{fam.essence.spent}</span> spent)
          </dd>
        </div>
        <div>
          <dt>Skill slots</dt>
          <dd>
            <span className="num">{fam.slots.used}</span> of{' '}
            <span className="num">{fam.slots.total}</span> used ({fam.slots.base} base plus{' '}
            {fam.slots.extra} unlocked, up to {fam.slots.maxExtra} extra)
          </dd>
        </div>
      </dl>

      <div className={shared.rule}>
        <h3 className={shared.ruleName}>
          Awakened skill{fam.awakenedSkill ? `: ${fam.awakenedSkill.name}` : ''}
        </h3>
        {fam.awakenedSkill ? (
          <p className={shared.text}>{fam.awakenedSkill.text}</p>
        ) : (
          <p>Not awakened yet. Awakening makes the familiar level 2 and opens skills.</p>
        )}
        {edit && !fam.awakened ? (
          <div className={styles.actions}>
            <Button variant="primary" onClick={() => setDialog('awaken')}>
              Awaken
            </Button>
          </div>
        ) : null}
      </div>

      <div className={shared.rule}>
        <h3 className={shared.ruleName}>Learned skills</h3>
        {fam.learned.length === 0 ? (
          <p>No skills learned.</p>
        ) : (
          <ul className={styles.items}>
            {fam.learned.map((skill) => (
              <li key={skill.actionId} className={styles.item}>
                <div className={styles.itemHead}>
                  <span className={styles.itemName}>{skill.name}</span>
                  {edit ? (
                    <Button variant="ghost" onClick={() => setForgetting(skill)}>
                      Forget {skill.name}
                    </Button>
                  ) : null}
                </div>
                <p className={shared.muted}>
                  <span className="num">{skill.essence}</span> Essence.{' '}
                  {frequencyText(skill.frequency)}.{skill.choice ? ` Choice: ${skill.choice}.` : ''}
                </p>
                <p className={shared.text}>
                  {ruleset.familiarSkillsById[skill.skillId]?.text ?? ''}
                </p>
              </li>
            ))}
          </ul>
        )}
        {edit && fam.awakened ? (
          <div className={styles.actions}>
            <Button variant="primary" onClick={() => setDialog('learn')}>
              Learn a skill
            </Button>
            <Button
              variant="secondary"
              disabled={!unlock.allowed}
              {...(unlock.allowed ? {} : { disabledReason: unlock.reasons.join(' ') })}
              onClick={() =>
                void command.run(
                  { type: 'unlockFamiliarSlot' },
                  { success: `${fam.name} has a new skill slot.` },
                )
              }
            >
              Unlock a slot ({unlock.cost?.amount ?? ruleset.familiar.essence.extraSlotCost}{' '}
              Essence)
            </Button>
          </div>
        ) : null}
      </div>

      <ErrorList messages={dialog ? [] : command.errors.map((e) => e.message)} />

      {isStaff ? (
        <div className={shared.rule}>
          <h3 className={shared.ruleName}>Break the bond</h3>
          <p className={shared.muted}>
            Costs {ruleset.familiar.familiarPoints.spend.breakBond} FP. Resets level, Essence, and
            skills.
          </p>
          <div className={styles.actions}>
            <Button variant="danger" onClick={() => setDialog('break')}>
              Break the bond
            </Button>
          </div>
        </div>
      ) : null}

      {dialog === 'awaken' ? (
        <AwakenDialog view={view} fam={fam} command={command} onClose={close} />
      ) : null}
      {dialog === 'rename' ? <RenameDialog fam={fam} command={command} onClose={close} /> : null}
      {dialog === 'learn' ? (
        <LearnDialog view={view} fam={fam} command={command} onClose={close} />
      ) : null}
      <ConfirmDialog
        open={dialog === 'break'}
        title={`Break the bond with ${fam.name}?`}
        confirmLabel="Break the bond"
        danger
        onConfirm={() => void breakBond()}
        onCancel={() => setDialog(null)}
      >
        <p>
          This costs {ruleset.familiar.familiarPoints.spend.breakBond} FP. {fam.name} goes back to
          being an ordinary creature: its level, Essence, awakened skill, and learned skills are
          reset. FP already spent on {fam.name} is lost and not refunded.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={forgetting !== null}
        title={`Forget ${forgetting?.name ?? 'skill'}?`}
        confirmLabel="Forget skill"
        danger
        onConfirm={() => {
          if (forgetting) void forget(forgetting);
        }}
        onCancel={() => setForgetting(null)}
      >
        <p>
          Forgetting costs {forgetFp} FP and frees the slot. The {forgetting?.essence ?? 0} Essence
          spent on it is not refunded.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function LevelSteps({
  view,
  fam,
  command,
}: {
  view: CharacterView;
  fam: FamiliarSection;
  command: CommandApi;
}) {
  const max = view.ruleset.familiar.levels.max;
  const result = preview(view.ruleset, view.sheet, { type: 'levelFamiliar' });
  const cost = result.cost?.amount ?? fam.nextLevelFp ?? 0;
  return (
    <LevelStepper
      label={fam.name}
      value={fam.level}
      min={fam.level}
      max={max}
      onChange={(next) => {
        if (next > fam.level)
          void command.run(
            { type: 'levelFamiliar', toLevel: next },
            { success: `${fam.name} is now level ${next}.` },
          );
      }}
      nextCostLabel={`Next level: ${cost} FP`}
      {...(result.allowed || fam.level >= max ? {} : { blockedReason: result.reasons.join(' ') })}
    />
  );
}

function RenameDialog({
  fam,
  command,
  onClose,
}: {
  fam: FamiliarSection;
  command: CommandApi;
  onClose: () => void;
}) {
  const formId = useId();
  const [name, setName] = useState(fam.name);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Enter the familiar's name.");
    setError('');
    const result = await command.run(
      { type: 'renameFamiliar', name: trimmed },
      { success: `Your familiar is now called ${trimmed}.` },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Rename ${fam.name}`}
      actions={
        <>
          <Button variant="primary" type="submit" form={formId}>
            Save name
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={shared.form} onSubmit={(e) => void submit(e)}>
        <Field label="Name" required error={error}>
          {(control) => (
            <input
              {...control}
              autoComplete="off"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}

function BondDialog({ command, onClose }: { command: CommandApi; onClose: () => void }) {
  const formId = useId();
  const [name, setName] = useState('');
  const [creature, setCreature] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Enter the familiar's name.");
    setError('');
    const result = await command.run(
      {
        type: 'bondFamiliar',
        name: trimmed,
        ...(creature.trim() ? { creature: creature.trim() } : {}),
      },
      { success: `Bonded with ${trimmed}.` },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={() => {
        command.clear();
        onClose();
      }}
      title="Bond a familiar"
      actions={
        <>
          <Button variant="primary" type="submit" form={formId}>
            Bond
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={shared.form} onSubmit={(e) => void submit(e)}>
        <p>Bonding makes the creature a level 1 familiar. It costs no FP.</p>
        <Field label="Name" required error={error}>
          {(control) => (
            <input
              {...control}
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label="Creature" hint="Optional, for example raven or rat.">
          {(control) => (
            <input
              {...control}
              autoComplete="off"
              value={creature}
              onChange={(e) => setCreature(e.target.value)}
            />
          )}
        </Field>
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}

function AwakenDialog({
  view,
  fam,
  command,
  onClose,
}: {
  view: CharacterView;
  fam: FamiliarSection;
  command: CommandApi;
  onClose: () => void;
}) {
  const formId = useId();
  const skills = view.ruleset.familiar.awakenedSkills;
  const [skillId, setSkillId] = useState('');
  const [error, setError] = useState('');
  const cost = preview(view.ruleset, view.sheet, {
    type: 'awakenFamiliar',
    awakenedSkillId: skillId || (skills[0]?.id ?? ''),
  }).cost?.amount;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!skillId) return setError('Choose the awakened skill.');
    setError('');
    const result = await command.run(
      { type: 'awakenFamiliar', awakenedSkillId: skillId },
      { success: `${fam.name} is awakened.` },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Awaken ${fam.name}`}
      actions={
        <>
          <Button variant="primary" type="submit" form={formId}>
            Awaken ({cost ?? 0} FP)
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={shared.form} onSubmit={(e) => void submit(e)}>
        <p>
          Awakening costs <span className="num">{cost ?? 0}</span> FP (
          <span className="num">{view.sheet.points.fp.available}</span> available) and makes{' '}
          {fam.name} level 2.
        </p>
        <fieldset className={create.group}>
          <legend className={create.legend}>Awakened skill</legend>
          {error ? <ErrorList messages={[error]} /> : null}
          <div className={create.choices}>
            {skills.map((s) => (
              <ChoiceCard
                key={s.id}
                name="awakened-skill"
                value={s.id}
                checked={skillId === s.id}
                onSelect={(id) => {
                  setSkillId(id);
                  setError('');
                }}
                title={s.name}
              >
                <p className={create.meta}>{frequencyText(s.frequency)}.</p>
                <p className={create.rule}>{s.text}</p>
              </ChoiceCard>
            ))}
          </div>
        </fieldset>
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}

function LearnDialog({
  view,
  fam,
  command,
  onClose,
}: {
  view: CharacterView;
  fam: FamiliarSection;
  command: CommandApi;
  onClose: () => void;
}) {
  const formId = useId();
  const { ruleset } = view;
  const [skillId, setSkillId] = useState('');
  const [choice, setChoice] = useState('');
  const [error, setError] = useState('');
  const tiers = [...new Set(ruleset.familiar.skills.map((s) => s.costEssence))].sort(
    (a, b) => a - b,
  );
  const chosen = skillId ? ruleset.familiarSkillsById[skillId] : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!chosen) return setError('Choose a skill.');
    if (chosen.choiceOnLearn && !choice.trim())
      return setError(`Enter the ${chosen.choiceOnLearn} for ${chosen.name}.`);
    setError('');
    const result = await command.run(
      {
        type: 'learnFamiliarSkill',
        skillId: chosen.id,
        ...(chosen.choiceOnLearn ? { choice: choice.trim() } : {}),
      },
      { success: `${fam.name} learned ${chosen.name}.` },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Learn a skill"
      actions={
        <>
          <Button variant="primary" type="submit" form={formId}>
            Learn skill
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={shared.form} onSubmit={(e) => void submit(e)}>
        <p>
          <span className="num">{fam.essence.available}</span> Essence available,{' '}
          <span className="num">{fam.slots.free}</span> of{' '}
          <span className="num">{fam.slots.total}</span> slots free.
        </p>
        {tiers.map((tier) => (
          <fieldset key={tier} className={create.group}>
            <legend className={create.legend}>{tier} Essence</legend>
            <div className={create.choices}>
              {ruleset.familiar.skills
                .filter((s) => s.costEssence === tier)
                .map((s) => (
                  <ChoiceCard
                    key={s.id}
                    name="familiar-skill"
                    value={s.id}
                    checked={skillId === s.id}
                    onSelect={(id) => {
                      setSkillId(id);
                      setChoice('');
                      setError('');
                      command.clear();
                    }}
                    title={s.name}
                  >
                    <p className={create.meta}>
                      {s.costEssence} Essence. {frequencyText(s.frequency)}.
                    </p>
                    <p className={create.rule}>{s.text}</p>
                  </ChoiceCard>
                ))}
            </div>
          </fieldset>
        ))}
        {chosen?.choiceOnLearn ? (
          <Field
            label={`${chosen.choiceOnLearn[0]?.toUpperCase() ?? ''}${chosen.choiceOnLearn.slice(1)} for ${chosen.name}`}
            hint="Fixed when the skill is learned."
            required
          >
            {(control) => (
              <input
                {...control}
                autoComplete="off"
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
              />
            )}
          </Field>
        ) : null}
        <ErrorList
          messages={[...(error ? [error] : []), ...command.errors.map((e) => e.message)]}
        />
      </form>
    </Dialog>
  );
}
