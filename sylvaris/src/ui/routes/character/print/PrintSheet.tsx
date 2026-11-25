// The printable character sheet: black on white, two US Letter pages at most for a veteran.
import type { ReactNode } from 'react';
import { UNNAMED_CHARACTER } from '../../../data/summary.ts';
import { dateText } from '../../../lib/names.ts';
import type { CharacterView } from '../view.ts';
import {
  callingChoicesText,
  innateLines,
  journalGroups,
  journalLine,
  languagesText,
  passiveDamageLines,
  PLAYER_TOOL_FOOTER,
  pointsRows,
  raceChoicesText,
  skillGroups,
  skillUsesText,
  slotsText,
  startingItemText,
  techniquesText,
  upkeepText,
} from './sheetModel.ts';
import styles from './print.module.css';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.block} aria-label={title}>
      <h4 className={styles.h}>{title}</h4>
      {children}
    </section>
  );
}

function Lines({ items }: { items: readonly string[] }) {
  return (
    <ul className={styles.list}>
      {items.map((text, i) => (
        <li key={i}>{text}</li>
      ))}
    </ul>
  );
}

export function PrintSheet({ view, printedAt }: { view: CharacterView; printedAt: Date }) {
  const { sheet, ruleset } = view;
  const { profile, race, calling, stats } = sheet;
  const name = profile.characterName.trim() || UNNAMED_CHARACTER;
  const damage = passiveDamageLines(sheet);
  const innates = innateLines(sheet);
  const journals = journalGroups(sheet);
  const artifact = sheet.artifact;
  const familiar = sheet.familiar;
  const owed = sheet.owed.filter((o) => !o.delivered);
  const raceChoices = raceChoicesText(ruleset, sheet);
  const callingChoices = callingChoicesText(ruleset, sheet);

  return (
    <article className={styles.paper} aria-label={`Character sheet for ${name}`}>
      <div className={styles.top}>
        <div>
          <h3 className={styles.title}>{name}</h3>
          <p>
            {profile.playerName ? `Player: ${profile.playerName}` : 'No player named'}
            {race ? ` · ${race.name}${race.size ? `, ${race.size}` : ''}` : ''}
          </p>
          {raceChoices ? <p>{raceChoices}.</p> : null}
        </div>
        <dl className={styles.vitals}>
          <div>
            <dt>Calling</dt>
            <dd>{calling?.name ?? 'None'}</dd>
          </div>
          <div>
            <dt>Events</dt>
            <dd>{sheet.fullEvents}</dd>
          </div>
          <div>
            <dt>Ruleset</dt>
            <dd>{sheet.rulesetId}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.tables}>
        <table className={styles.table} aria-label="Points">
          <thead>
            <tr>
              <th scope="col">Points</th>
              <th scope="col" className={styles.right}>
                Earned
              </th>
              <th scope="col" className={styles.right}>
                Spent
              </th>
              <th scope="col" className={styles.right}>
                Left
              </th>
            </tr>
          </thead>
          <tbody>
            {pointsRows(ruleset, sheet).map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td className={styles.n}>{row.earned}</td>
                <td className={styles.n}>{row.spent}</td>
                <td className={styles.n}>{row.available}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className={styles.table} aria-label="Stats">
          <tbody>
            <tr>
              <th scope="row">Life Points</th>
              <td className={styles.n}>{stats.lifePoints.value}</td>
            </tr>
            <tr>
              <th scope="row">Armor Points</th>
              <td className={styles.n}>{stats.armorPoints.value}</td>
            </tr>
            {damage.map((d) => (
              <tr key={d.label}>
                <th scope="row">Passive damage, {d.label.toLowerCase()}</th>
                <td className={styles.n}>+{d.value}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Spirit Fragments</th>
              <td className={styles.n}>
                {stats.spiritFragments.current} of {stats.spiritFragments.max}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className={styles.facts}>
        <strong>Slots:</strong> {slotsText(sheet) || 'None'}. <strong>Languages:</strong>{' '}
        {languagesText(sheet) || 'None'}. <strong>Upkeep:</strong> {upkeepText(sheet)}.
      </p>

      {innates.length > 0 ? (
        <Block title={`${race?.name ?? 'Race'} innates`}>
          <Lines items={innates} />
        </Block>
      ) : null}

      <Block title="Skills">
        <table className={`${styles.table} ${styles.skillTable}`} aria-label="Skills">
          <thead>
            <tr>
              <th scope="col">Skill</th>
              <th scope="col" className={styles.right}>
                Level
              </th>
              <th scope="col">Techniques</th>
              <th scope="col">Uses</th>
            </tr>
          </thead>
          {skillGroups(sheet).map((group) => (
            <tbody key={group.id}>
              <tr>
                <th scope="colgroup" colSpan={4} className={styles.groupHead}>
                  {group.name}
                </th>
              </tr>
              {group.skills.map((skill) => (
                <tr key={skill.skillId}>
                  <th scope="row">{skill.displayName}</th>
                  <td className={styles.n}>{skill.level}</td>
                  <td>{techniquesText(skill.techniques)}</td>
                  <td>{skillUsesText(skill)}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
        <p className={styles.muted}>
          Uses: B Basic, E Expert, M Master, G Grandmaster, with the uses each spends.
        </p>
      </Block>

      <div className={styles.flow}>
        {journals.map((group) => (
          <Block key={group.title} title={group.title}>
            <Lines items={group.entries.map((e) => journalLine(ruleset, e))} />
          </Block>
        ))}
        {calling ? (
          <Block title={`Calling: ${calling.name}`}>
            <p>
              <strong>{calling.innate.name}:</strong> {calling.innate.summary}
            </p>
            {callingChoices ? <p>{callingChoices}.</p> : null}
            {calling.detriment ? <p>Detriment: {calling.detriment}</p> : null}
          </Block>
        ) : null}
        {artifact ? (
          <Block title={`Artifact: ${artifact.name}`}>
            <p>
              Slots {artifact.slotsUsed} of {artifact.slotsUnlocked} used.
            </p>
            <Lines
              items={artifact.powers.map(
                (p) => `Tier ${p.tier}: ${p.summary}${p.choice ? ` (${p.choice})` : ''}`,
              )}
            />
          </Block>
        ) : null}
        {familiar ? (
          <Block title={`Familiar: ${familiar.name}`}>
            <p>
              {[familiar.form, familiar.quality].filter(Boolean).join(', ')}. Tricks{' '}
              {familiar.slotsUsed} of {familiar.trickSlots} slots.
            </p>
            <Lines
              items={familiar.tricks.map((t) => `${t.name}${t.uses ? `, ${t.uses}/re-pop` : ''}`)}
            />
          </Block>
        ) : null}
        {sheet.boons.entries.length > 0 ? (
          <Block title="Boons">
            <Lines
              items={sheet.boons.entries.map(
                (b) => `${b.name} (${b.slot === 'greater' ? 'Greater' : 'Lesser'})`,
              )}
            />
          </Block>
        ) : null}
        {sheet.startingItems.length > 0 ? (
          <Block title="Starting items">
            <Lines items={sheet.startingItems.map((s) => startingItemText(ruleset, s))} />
          </Block>
        ) : null}
        {owed.length > 0 ? (
          <Block title="Owed">
            <Lines items={owed.map((o) => o.text)} />
          </Block>
        ) : null}
        {profile.notes.trim() ? (
          <Block title="Notes">
            <p className={styles.pre}>{profile.notes.trim()}</p>
          </Block>
        ) : null}
      </div>

      <p className={styles.footer}>
        Printed {dateText(printedAt.toISOString())} · Ruleset {sheet.rulesetId} ·{' '}
        {PLAYER_TOOL_FOOTER}
      </p>
    </article>
  );
}
