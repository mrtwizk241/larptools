import { preview, type AncestryAbilityView, type AncestrySection } from '../../../engine/index.ts';
import { LevelStepper } from '../../components/index.ts';
import { useCommand } from '../../data/engineHooks.ts';
import { ErrorList } from './ErrorList.tsx';
import { oneLine } from './print/sheetModel.ts';
import { ancestryAbilityLine } from './sheetSections.ts';
import { SkillGroupHeading } from './SkillGroupHeading.tsx';
import type { CharacterView } from './view.ts';
import styles from './character.module.css';

/**
 * The Ancestry group of the Skills card: the two leveled abilities with LXP left. Staff level them
 * here with LXP; players see the ones they have. Ancestry passives are in Passive Abilities.
 */
export function AncestryGroup({
  view,
  ancestry,
}: {
  view: CharacterView;
  ancestry: AncestrySection;
}) {
  const command = useCommand(view.id);
  const lxp = view.sheet.points.lxp.available;
  const abilities = view.isStaff
    ? ancestry.abilities
    : ancestry.abilities.filter((a) => a.level > 0);
  if (abilities.length === 0 && lxp <= 0) return null;
  return (
    <div className={styles.skillGroup}>
      <SkillGroupHeading
        title="Ancestry"
        left={lxp < 0 ? `${-lxp} LXP overspent` : `${lxp} LXP left`}
      />
      {abilities.length > 0 ? (
        <ul className={styles.skillLines}>
          {abilities.map((ability) => (
            <AbilityItem
              key={ability.id}
              view={view}
              ability={ability}
              onLevel={(next) =>
                void command.run(
                  { type: 'levelAncestryAbility', abilityId: ability.id },
                  { success: `${ability.name} is now level ${next}.` },
                )
              }
            />
          ))}
        </ul>
      ) : null}
      <ErrorList messages={command.errors.map((e) => e.message)} />
    </div>
  );
}

function AbilityItem({
  view,
  ability,
  onLevel,
}: {
  view: CharacterView;
  ability: AncestryAbilityView;
  onLevel: (next: number) => void;
}) {
  const line = ancestryAbilityLine(ability);
  const text = ability.copied ? ability.copied.text : ability.text;
  return (
    <li className={styles.skillLine}>
      <span>
        <span className={styles.skillName}>{line.name}</span>
        {line.detail ? ` · ${line.detail}` : ''}
      </span>
      <span className={styles.lineText}>{oneLine(text)}</span>
      {view.isStaff ? <AbilityStepper view={view} ability={ability} onLevel={onLevel} /> : null}
    </li>
  );
}

function AbilityStepper({
  view,
  ability,
  onLevel,
}: {
  view: CharacterView;
  ability: AncestryAbilityView;
  onLevel: (next: number) => void;
}) {
  const result = preview(view.ruleset, view.sheet, {
    type: 'levelAncestryAbility',
    abilityId: ability.id,
  });
  const cost = result.cost?.amount ?? view.ruleset.ruleset.lxp.costPerLevel;
  const max = view.ruleset.ruleset.lxp.maxAbilityLevel ?? Number.POSITIVE_INFINITY;
  return (
    <LevelStepper
      label={ability.name}
      value={ability.level}
      min={ability.level}
      max={max}
      onChange={(next) => {
        if (next > ability.level) onLevel(next);
      }}
      nextCostLabel={`Next level: ${cost} LXP`}
      {...(result.allowed ? {} : { blockedReason: result.reasons.join(' ') })}
    />
  );
}
