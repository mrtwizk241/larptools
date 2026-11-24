// The printable character sheet (I-16): black on white, US Letter. Page 1 is for play: header,
// points, Health, Armor, and damage lines, skills with a box per use, passive effects,
// profession, familiar, boons. Page 2 holds memorized spells, recipes, and performances, then
// character effects. Story notes, starting items, and owed rewards are not printed.
import { useMemo, type ReactNode } from 'react';
import type { Sheet } from '../../../../engine/index.ts';
import { UNNAMED_CHARACTER } from '../../../data/summary.ts';
import { currencyAbbr, dateText } from '../../../lib/names.ts';
import { APP_VERSION } from '../../../version.ts';
import { MAX_AGE } from '../../create/validation.ts';
import { ancestryLine, frequencyText } from '../format.ts';
import { savedDamageLines } from '../play/combat.ts';
import { passiveAbilities, skillGroupViews, type SkillGroupView } from '../sheetSections.ts';
import type { CharacterView } from '../view.ts';
import {
  damageRows,
  memoryLists,
  periodText,
  printSkillGroups,
  type BoxRow,
  type DamageRow,
  type PrintSkill,
} from './sheetModel.ts';
import styles from './print.module.css';

export const UNOFFICIAL = 'Unofficial fan tool, not affiliated with Rustwater LARP.';

/** A titled block that is kept on one page and in one column. */
export function Block({
  title,
  left = null,
  children,
}: {
  title: string;
  /** What is left to spend, shown after the title: "3 AP left". */
  left?: string | null;
  children: ReactNode;
}) {
  return (
    <section className={styles.block} aria-label={title}>
      <h4 className={styles.h}>
        {title}
        {left ? <span className={styles.left}> {left}</span> : null}
      </h4>
      {children}
    </section>
  );
}

function None({ children = 'None.' }: { children?: string }) {
  return <p className={styles.muted}>{children}</p>;
}

export function PrintSheet({ view, printedAt }: { view: CharacterView; printedAt: Date }) {
  const { sheet, ruleset } = view;
  const name = sheet.profile.characterName.trim() || UNNAMED_CHARACTER;
  // The player's damage lines saved on this device (Play Tracker), permanent bonuses only.
  const damage = useMemo(
    () => damageRows(savedDamageLines(view.id, sheet, ruleset)),
    [view.id, sheet, ruleset],
  );
  const groups = skillGroupViews(ruleset, sheet);
  return (
    <article className={styles.paper} aria-label={`Character sheet for ${name}`}>
      <SheetTop sheet={sheet} name={name} printedAt={printedAt} />
      <PointsLines view={view} />
      <Vitals sheet={sheet} damage={damage} />
      <div className={styles.flow}>
        <SkillsBlocks view={view} />
        <PassivesBlock view={view} />
        <ProfessionBlock sheet={sheet} group={groups.find((g) => g.id === 'profession')} />
        <FamiliarBlock sheet={sheet} group={groups.find((g) => g.id === 'familiar')} />
        <BoonsBlock sheet={sheet} />
      </div>
      <div className={styles.page2}>
        <MemoryBlock sheet={sheet} />
        <EffectsBlock sheet={sheet} />
      </div>
      <p className={styles.footer}>
        Printed {dateText(printedAt.toISOString())} · Ruleset {sheet.rulesetId} · App {APP_VERSION}{' '}
        · {UNOFFICIAL}
      </p>
    </article>
  );
}

function SheetTop({ sheet, name, printedAt }: { sheet: Sheet; name: string; printedAt: Date }) {
  const { profile, ancestry, infection } = sheet;
  const facts = [
    profile.playerName ? `Player: ${profile.playerName}` : null,
    ancestry ? ancestryLine(ancestry.ancestryName, ancestry.subtypeName) : null,
    profile.age !== null ? `Age ${profile.age} of ${MAX_AGE}` : null,
    sheet.retired ? 'Retired' : null,
  ].filter((f): f is string => f !== null);
  return (
    <div className={styles.top}>
      <div>
        <h3 className={styles.title}>{name}</h3>
        <p>{facts.join(' · ')}</p>
      </div>
      <div className={styles.topRight}>
        {infection ? (
          <p>
            {infection.label}{' '}
            <span className={styles.n}>
              {infection.current} of {infection.max}
            </span>
            {infection.reachedMax ? ' (max)' : ''}
          </p>
        ) : null}
        <p className={styles.eventLine}>
          Event <span className={styles.writeIn} aria-hidden="true" /> Date{' '}
          <span className={styles.n}>{dateText(printedAt.toISOString())}</span>
        </p>
      </div>
    </div>
  );
}

/** Points left: CXP, LXP, PXP, Shinies, FP on one line; AP left of earned on the next. */
function PointsLines({ view }: { view: CharacterView }) {
  const { ruleset, sheet } = view;
  const { cxp, lxp, pxp, fp, shinies } = sheet.points;
  const items: { id: string; value: number }[] = [
    { id: 'cxp', value: cxp.available },
    { id: 'lxp', value: lxp.available },
    { id: 'pxp', value: pxp.available },
    { id: 'shinies', value: shinies.balance },
    { id: 'fp', value: fp.available },
  ];
  return (
    <section className={styles.points} aria-label="Points">
      <ul className={styles.inline} aria-label="Points left">
        {items.map((item) => (
          <li key={item.id}>
            <span className={styles.label}>{currencyAbbr(ruleset, item.id)}</span>{' '}
            <span className={styles.n}>{item.value}</span>
          </li>
        ))}
      </ul>
      <ul className={styles.inline} aria-label="AP left of earned">
        <li className={styles.label}>AP left of earned</li>
        {ruleset.archetypes.map((a) => {
          const pool = sheet.points.ap[a.id] ?? { earned: 0, spent: 0, available: 0 };
          return (
            <li key={a.id}>
              {a.name}{' '}
              <span className={styles.n}>
                {pool.available} of {pool.earned}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The main focus: Max Health, Armor, and the damage lines to call. */
function Vitals({ sheet, damage }: { sheet: Sheet; damage: DamageRow[] }) {
  return (
    <section className={styles.focus} aria-label="Health, Armor, and Damage">
      <dl className={styles.bigStats}>
        <div>
          <dt>Max Health</dt>
          <dd className={styles.big}>{sheet.stats.maxHealth}</dd>
        </div>
        <div>
          <dt>Armor</dt>
          <dd className={styles.big}>{sheet.stats.armor}</dd>
        </div>
      </dl>
      <table className={styles.damage} aria-label="Damage">
        <thead>
          <tr>
            <th scope="col">Damage line</th>
            <th scope="col" className={styles.right}>
              Call
            </th>
          </tr>
        </thead>
        <tbody>
          {damage.map((row) => (
            <tr key={row.key} className={row.name === '' ? styles.blankRow : undefined}>
              <td>{row.name}</td>
              <td className={styles.call}>{row.call}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Empty boxes to tick by hand, one per use. */
function Boxes({ count }: { count: number }) {
  return (
    <span
      className={styles.boxes}
      role="img"
      aria-label={`${count} empty ${count === 1 ? 'box' : 'boxes'}`}
    >
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={styles.useBox} />
      ))}
    </span>
  );
}

function rowLabel(row: BoxRow): string {
  const period = row.period ? periodText(row.period) : (row.note ?? '');
  if (row.part === null) return period.charAt(0).toUpperCase() + period.slice(1);
  const part = row.mark ? `${row.part} (${row.mark})` : row.part;
  return period ? `${part}, ${period}` : part;
}

function UseRows({ rows }: { rows: readonly BoxRow[] }) {
  if (rows.length === 0) return null;
  return (
    <ul className={styles.useRows}>
      {rows.map((row) => (
        <li key={row.key}>
          <span className={styles.useLabel}>{rowLabel(row)}</span>
          {row.count > 0 ? <Boxes count={row.count} /> : null}
        </li>
      ))}
    </ul>
  );
}

function SkillItem({ skill }: { skill: PrintSkill }) {
  return (
    <li>
      <p>
        <strong>{skill.name}</strong>
        {skill.mark ? <span className={styles.mark}> ({skill.mark})</span> : null}
        {skill.note ? <span className={styles.muted}> · {skill.note}</span> : null}
      </p>
      <UseRows rows={skill.rows} />
    </li>
  );
}

function SkillsBlocks({ view }: { view: CharacterView }) {
  const groups = printSkillGroups(view.ruleset, view.sheet);
  if (groups.length === 0)
    return (
      <Block title="Skills">
        <None>No skills learned.</None>
      </Block>
    );
  return (
    <>
      {groups.map((group) => (
        <section key={group.id} className={styles.block} aria-label={`${group.title} skills`}>
          <h4 className={styles.h}>
            {group.title}
            {group.left ? <span className={styles.left}> {group.left}</span> : null}
          </h4>
          <ul className={styles.skills}>
            {group.skills.map((skill) => (
              <SkillItem key={skill.key} skill={skill} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function PassivesBlock({ view }: { view: CharacterView }) {
  const passives = passiveAbilities(view.ruleset, view.sheet);
  return (
    <Block title="Passive Effects">
      {passives.length === 0 ? (
        <None />
      ) : (
        <ul className={styles.lines}>
          {passives.map((p) => (
            <li key={p.key}>
              <strong>{p.name}:</strong> {p.text}
              {p.counted ? <em> Counted in the totals.</em> : null}
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}

function ProfessionBlock({ sheet, group }: { sheet: Sheet; group: SkillGroupView | undefined }) {
  const { profession } = sheet;
  const byId = new Map((profession?.skills ?? []).map((s) => [s.id, s]));
  return (
    <Block title="Profession" left={group?.left ?? null}>
      {profession === null ? (
        <None>No profession.</None>
      ) : (
        <>
          <p>
            <strong>{profession.name}</strong>. Passive: {profession.passive.sheetName}.
          </p>
          <ul className={styles.skills}>
            {(group?.lines ?? []).map((line) => {
              const skill = byId.get(line.key);
              const upgrades = [
                skill && skill.adeptUpgrades > 0 ? `${skill.adeptUpgrades} adept` : null,
                skill && skill.advancedUpgrades > 0 ? `${skill.advancedUpgrades} advanced` : null,
              ].filter((u): u is string => u !== null);
              return (
                <li key={line.key}>
                  <p>
                    <strong>{line.name}</strong>
                    {upgrades.length > 0 ? (
                      <span className={styles.muted}> · {upgrades.join(', ')}</span>
                    ) : null}
                  </p>
                  {skill && skill.uses.count > 0 ? (
                    <UseRows
                      rows={[
                        {
                          key: 'uses',
                          part: null,
                          mark: null,
                          count: skill.uses.count,
                          period: skill.uses.per,
                          note: null,
                        },
                      ]}
                    />
                  ) : (
                    <p className={styles.muted}>{line.detail}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Block>
  );
}

function FamiliarBlock({ sheet, group }: { sheet: Sheet; group: SkillGroupView | undefined }) {
  const { familiar } = sheet;
  return (
    <Block title="Familiar" left={group?.left ?? null}>
      {familiar === null ? (
        <None>No familiar.</None>
      ) : (
        <>
          <p>
            <strong>{familiar.name}</strong>
            {familiar.creature ? ` (${familiar.creature})` : ''}, level{' '}
            <span className={styles.n}>{familiar.level}</span>
            {familiar.awakenedSkill ? `, awakened: ${familiar.awakenedSkill.name}` : ''}. Essence{' '}
            <span className={styles.n}>
              {familiar.essence.available} of {familiar.essence.total}
            </span>{' '}
            left.
          </p>
          {familiar.learned.length === 0 ? (
            <None>No familiar skills.</None>
          ) : (
            <ul className={styles.lines}>
              {familiar.learned.map((s) => (
                <li key={s.actionId}>
                  <strong>
                    {s.name}
                    {s.choice ? `: ${s.choice}` : ''}
                  </strong>{' '}
                  <span className={styles.muted}>{frequencyText(s.frequency)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Block>
  );
}

function BoonsBlock({ sheet }: { sheet: Sheet }) {
  return (
    <Block title="Boons">
      {sheet.boons.length === 0 ? (
        <None />
      ) : (
        <ul className={styles.lines}>
          {sheet.boons.map((b) => (
            <li key={b.actionId}>
              {b.name}
              {b.expires ? <span className={styles.muted}> (expires: {b.expires})</span> : null}
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}

function MemoryBlock({ sheet }: { sheet: Sheet }) {
  const lists = memoryLists(sheet);
  return (
    <Block title="Spells, Recipes, and Performances">
      {lists.length === 0 ? (
        <None>Nothing memorized.</None>
      ) : (
        lists.map((l) => (
          <p key={l.kind}>
            <strong>{l.title}</strong>
            {l.slots ? <span className={styles.muted}> (slots used: {l.slots})</span> : null}:{' '}
            {l.names.length > 0 ? `${l.names.join(', ')}.` : 'none memorized.'}
          </p>
        ))
      )}
    </Block>
  );
}

/**
 * Character or infection effects, when there are any. Story notes (and the knowledges that became
 * story notes) stay off the paper: they can run long and would push the sheet past two pages.
 */
function EffectsBlock({ sheet }: { sheet: Sheet }) {
  const effects = sheet.profile.effects.trim();
  if (!effects) return null;
  return (
    <Block title="Character Effects">
      <p className={styles.pre}>{effects}</p>
    </Block>
  );
}
