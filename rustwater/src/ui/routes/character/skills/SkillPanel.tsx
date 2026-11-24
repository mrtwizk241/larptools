// What a skill does, part by part, shown when a skill row is opened (and on the skill's page):
// each part's frequency, uses, and description. The level controls sit on the row
// (SkillControls). Mastery magic also lists its abilities.
import { useState } from 'react';
import { Button } from '../../../components/index.ts';
import type { CharacterView } from '../view.ts';
import { expendsText, masteryAbilities } from './masteryMagic.ts';
import {
  frequencyWords,
  ownedPart,
  partTitle,
  skillDisplayName,
  skillParts,
  usesWords,
  type Skill,
} from './skillInfo.ts';
import expand from '../expand.module.css';

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
  const [showAll, setShowAll] = useState(false);
  const owned = view.sheet.skills.find((s) => s.skillId === skill.id);
  const allParts = skillParts(skill);
  const ownedParts = allParts.filter((p) => (ownedPart(owned, p)?.level ?? 0) > 0);
  const shownParts = ownedView && !showAll && ownedParts.length > 0 ? ownedParts : allParts;
  const hiddenParts = allParts.filter((p) => !shownParts.includes(p));
  const abilities = masteryAbilities(view.ruleset, skill.id);
  const PartHeading = headingLevel === 3 ? 'h3' : 'h4';

  return (
    <>
      {skill.text ? <p className={expand.text}>{skill.text}</p> : null}
      {shownParts.map((part) => {
        const def = skill.parts[part];
        if (!def) return null;
        const mine = ownedPart(owned, part);
        const level = mine?.level ?? 0;
        const uses = mine ? usesWords(mine) : null;
        return (
          <section
            key={part}
            className={expand.part}
            aria-label={`${skillDisplayName(view.ruleset, skill)} ${partTitle(skill, part)}`}
          >
            <div className={expand.partHead}>
              <PartHeading className={expand.partTitle}>{partTitle(skill, part)}</PartHeading>
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
            </dl>
            <p className={expand.text}>{def.text}</p>
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
    </>
  );
}

/** "Adept", "Adept and Advanced", "Adept, Advanced and Mastery". */
function listText(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] ?? ''}`;
}
