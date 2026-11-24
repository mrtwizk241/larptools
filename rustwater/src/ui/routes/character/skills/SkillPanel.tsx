// What a skill does, part by part, shown when a skill row is opened (and on the skill's page).
// Players get a + beside each level they can still learn; staff get the level stepper. Mastery
// magic also lists its abilities.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { maxLevelOf } from '../../../../engine/index.ts';
import type { SkillPart } from '../../../../engine/model.ts';
import { Button, IconButton, LevelStepper } from '../../../components/index.ts';
import type { CharacterView } from '../view.ts';
import { expendsText, masteryAbilities } from './masteryMagic.ts';
import { RequestSkillDialog } from './RequestSkillDialog.tsx';
import { canRequest, requestableParts } from './requestParts.ts';
import { LearnDialog, RefundDialog } from './SkillDialogs.tsx';
import {
  MARK_TEXT,
  archetypeName,
  costText,
  frequencyWords,
  lockedArchetype,
  ownedPart,
  partLabel,
  partTitle,
  previewLearn,
  skillDisplayName,
  skillParts,
  typeLabel,
  usesWords,
  type Skill,
} from './skillInfo.ts';
import expand from '../expand.module.css';
import styles from './skills.module.css';

type DialogState = { kind: 'learn' | 'refund' | 'request'; part: SkillPart } | null;

/**
 * The skill's parts with their rule text. With `ownedView` (a player with Owned only on), only
 * learned parts show, with a button for the rest.
 */
export function SkillPanel({
  view,
  skill,
  ownedView,
  headingLevel = 4,
}: {
  view: CharacterView;
  skill: Skill;
  ownedView: boolean;
  headingLevel?: 3 | 4;
}) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [showAll, setShowAll] = useState(false);
  const owned = view.sheet.skills.find((s) => s.skillId === skill.id);
  const allParts = skillParts(skill);
  const ownedParts = allParts.filter((p) => (ownedPart(owned, p)?.level ?? 0) > 0);
  const shownParts = ownedView && !showAll && ownedParts.length > 0 ? ownedParts : allParts;
  const hiddenParts = allParts.filter((p) => !shownParts.includes(p));
  const requestable = canRequest(view) ? requestableParts(view, skill) : [];
  const abilities = masteryAbilities(view.ruleset, skill.id);
  const PartHeading = headingLevel === 3 ? 'h3' : 'h4';

  return (
    <>
      <p className={styles.metaLine}>
        <span className={styles.typeBadge}>{typeLabel(skill)}</span>
        <span>{archetypeLine(view, skill)}</span>
      </p>
      {skill.marks.length > 0 ? (
        <ul className={styles.marks} aria-label="Marks">
          {skill.marks.map((mark) => (
            <li key={mark}>{MARK_TEXT[mark]}</li>
          ))}
        </ul>
      ) : null}
      {skill.text ? <p className={expand.text}>{skill.text}</p> : null}
      {shownParts.map((part) => {
        const def = skill.parts[part];
        if (!def) return null;
        const mine = ownedPart(owned, part);
        const level = mine?.level ?? 0;
        const uses = mine ? usesWords(mine) : null;
        const label = partLabel(view.ruleset, skill, part);
        const canAsk = requestable.some((r) => r.part === part);
        const single = maxLevelOf(view.ruleset, def.costKind) === 1;
        return (
          <section
            key={part}
            className={expand.part}
            aria-label={`${skillDisplayName(view.ruleset, skill)} ${partTitle(skill, part)}`}
          >
            <div className={expand.partHead}>
              <PartHeading className={expand.partTitle}>{partTitle(skill, part)}</PartHeading>
              {view.isStaff ? null : (
                <span className={expand.partLevel}>
                  {level > 0 ? (single ? 'Learned' : `Level ${level}`) : 'Not learned'}
                </span>
              )}
              {canAsk ? (
                <IconButton
                  className={styles.addButton}
                  aria-label={`I learned ${label}`}
                  icon={<Plus />}
                  onClick={() => setDialog({ kind: 'request', part })}
                />
              ) : null}
            </div>
            <dl className={expand.facts}>
              <div>
                <dt>Frequency</dt>
                <dd>{frequencyWords(def)}</dd>
              </div>
              <div>
                <dt>Uses</dt>
                <dd>{uses ?? (level > 0 ? 'No uses to track' : 'None until learned')}</dd>
              </div>
              {mine?.teacher ? (
                <div>
                  <dt>Teacher</dt>
                  <dd>{mine.teacher}</dd>
                </div>
              ) : null}
            </dl>
            <p className={expand.text}>{def.text}</p>
            {view.isStaff ? (
              <PartStepper
                view={view}
                skill={skill}
                part={part}
                level={level}
                onRaise={() => setDialog({ kind: 'learn', part })}
                onLower={() => setDialog({ kind: 'refund', part })}
              />
            ) : null}
          </section>
        );
      })}
      {hiddenParts.length > 0 ? (
        <div>
          <Button variant="ghost" onClick={() => setShowAll(true)}>
            {`Show ${listText(hiddenParts.map((p) => partTitle(skill, p)))} (not learned yet)`}
          </Button>
        </div>
      ) : null}
      {abilities.length > 0 ? (
        <>
          <PartHeading className={expand.subheading}>Abilities</PartHeading>
          {abilities.map((ability) => (
            <section key={ability.id} className={expand.part} aria-label={ability.name}>
              <p className={expand.partTitle}>{ability.name}</p>
              <p className={expand.muted}>{expendsText(view.ruleset, ability)}</p>
              <p className={expand.text}>{ability.text}</p>
            </section>
          ))}
          {owned ? (
            <p className={expand.muted}>
              Track these on the Play Tracker: tapping one spends the uses it needs.
            </p>
          ) : null}
        </>
      ) : null}
      {dialog?.kind === 'learn' ? (
        <LearnDialog view={view} skill={skill} part={dialog.part} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'refund' ? (
        <RefundDialog
          view={view}
          skill={skill}
          part={dialog.part}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'request' ? (
        <RequestSkillDialog
          view={view}
          skill={skill}
          part={dialog.part}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}

/** "Adept", "Adept and Advanced", "Adept, Advanced and Mastery". */
function listText(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] ?? ''}`;
}

function archetypeLine(view: CharacterView, skill: Skill): string {
  const { ruleset, sheet } = view;
  if (skill.archetype !== undefined) return `${archetypeName(ruleset, skill.archetype)} archetype`;
  const locked = lockedArchetype(sheet, skill);
  if (locked !== null) return `${archetypeName(ruleset, locked)} archetype (chosen)`;
  const rule = skill.archetypeRule;
  if (rule?.kind === 'same-as-skill') {
    const other = ruleset.skillsById[rule.skill]?.name ?? rule.skill;
    return `Same archetype as ${other}`;
  }
  const options = (skill.archetypeOptions ?? []).map((a) => archetypeName(ruleset, a));
  const list =
    options.length <= 1
      ? options.join('')
      : `${options.slice(0, -1).join(', ')} or ${options[options.length - 1] ?? ''}`;
  return `Archetype chosen when first learned: ${list}`;
}

function PartStepper({
  view,
  skill,
  part,
  level,
  onRaise,
  onLower,
}: {
  view: CharacterView;
  skill: Skill;
  part: SkillPart;
  level: number;
  onRaise: () => void;
  onLower: () => void;
}) {
  const def = skill.parts[part];
  if (!def) return null;
  const result = previewLearn(view.ruleset, view.sheet, skill, part);
  const max = maxLevelOf(view.ruleset, def.costKind) ?? Number.POSITIVE_INFINITY;
  const atMax = level >= max;
  return (
    <LevelStepper
      label={partLabel(view.ruleset, skill, part)}
      value={level}
      min={0}
      max={max}
      onChange={(next) => (next > level ? onRaise() : onLower())}
      {...(result.cost
        ? { nextCostLabel: `Next level: ${costText(view.ruleset, result.cost)}` }
        : {})}
      {...(!result.allowed && !atMax ? { blockedReason: result.reasons.join(' ') } : {})}
    />
  );
}
