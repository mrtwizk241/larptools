// Race: size, languages, choices, innates with their uses, natural weapon, and effects that only
// apply sometimes, in words.
import { Link } from 'react-router';
import { skillDisplayNameFor } from '../../../../engine/index.ts';
import { Card } from '../../../components/index.ts';
import type { CharacterView } from '../view.ts';
import {
  conditionalEffectText,
  innateHeading,
  raceChoiceRows,
  weaponName,
} from './overviewModel.ts';
import styles from '../character.module.css';
import own from './overview.module.css';

export function RaceCard({ view }: { view: CharacterView }) {
  const { race } = view.sheet;
  const { ruleset } = view;
  if (!race) return null;
  // The natural weapon shows once, in its own row (AC-12): not as a choice, not as an innate.
  const weaponInnates = race.innates.filter((i) => ruleset.raceInnatesById[i.id]?.naturalWeapon);
  const weaponChoiceIds = new Set(
    weaponInnates.map((i) => ruleset.raceInnatesById[i.id]?.naturalWeapon?.choiceId),
  );
  const def = ruleset.racesById[race.raceId];
  const choices = raceChoiceRows(ruleset, view.sheet).filter(
    (row) =>
      !race.naturalWeapon ||
      !def?.choices.some((c) => c.label === row.label && weaponChoiceIds.has(c.id)),
  );
  const innates = race.naturalWeapon
    ? race.innates.filter((i) => !weaponInnates.includes(i))
    : race.innates;
  const flags = race.sheetFlags;
  return (
    <Card title="Race" className={styles.card ?? ''}>
      <dl className={styles.facts}>
        <div>
          <dt>Race</dt>
          <dd>
            {race.name}
            {race.size ? `, ${race.size}` : ''}
          </dd>
        </div>
        <div>
          <dt>Reads and writes</dt>
          <dd>{race.literacyLanguage.name}</dd>
        </div>
        {choices.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd className={styles.wrap}>{row.value}</dd>
          </div>
        ))}
        {innates.length > 0 ? (
          <div>
            <dt>Innates</dt>
            <dd>
              <ul className={own.lines}>
                {innates.map((innate) => (
                  <li key={innate.id} className={own.innate}>
                    <span className={own.innateName}>{innateHeading(ruleset, innate)}</span>
                    <span>{innate.summary}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
        {race.naturalWeapon ? (
          <div>
            <dt>Natural weapon</dt>
            <dd>
              {weaponName(race.naturalWeapon.id)}
              {race.naturalWeapon.greatclaw ? ' (Greatclaw)' : ''}, base{' '}
              {race.naturalWeapon.baseDamage} damage
            </dd>
          </div>
        ) : null}
        {race.conditionalEffects.length > 0 ? (
          <div>
            <dt>Only sometimes</dt>
            <dd>
              <ul className={own.lines}>
                {race.conditionalEffects.map((s, i) => (
                  <li key={`${s.stat}-${i}`}>{conditionalEffectText(s)}</li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
        {flags &&
        (flags.healingImmune || flags.lifeRestoredByRefit || flags.separateArmorAndLifeRefit) ? (
          <div>
            <dt>Body</dt>
            <dd>
              <ul className={own.lines}>
                {flags.healingImmune ? (
                  <li>Normal Healing does not work on this character.</li>
                ) : null}
                {flags.lifeRestoredByRefit ? (
                  <li>Life Points come back by repair or refit, like armor.</li>
                ) : null}
                {flags.separateArmorAndLifeRefit ? (
                  <li>
                    Armor Points and Life Points are refit separately; extra does not carry over.
                  </li>
                ) : null}
              </ul>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Racial skills</dt>
          <dd>
            <ul className={own.links}>
              {race.racialSkillIds.map((id) => (
                <li key={id}>
                  <Link className={own.link} to={`/c/${view.id}/skills/${id}`}>
                    {skillDisplayNameFor(ruleset, id, view.sheet.race)}
                  </Link>
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
    </Card>
  );
}
