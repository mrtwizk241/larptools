// Reference pages built from the rules data the sheet uses, so they always match the app.
// Filter chips reuse the Skills screen's toggle chips: multi-select, none pressed shows all.
import { useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { Ruleset } from '../../../data/index.ts';
import { Field, ScrollRow } from '../../components/index.ts';
import { frequencyText } from '../character/format.ts';
import {
  archetypeName,
  CATEGORIES,
  filterChips,
  isCategory,
  partLabel,
  skillChipIds,
  skillParts,
  skillTitle,
  typeLabel,
  type FilterChip,
} from '../character/skills/skillInfo.ts';
import skillStyles from '../character/skills/skills.module.css';
import type { Article } from './articles.ts';
import { EFFECT_MARKS, EFFECTS, EFFECTS_INTRO } from './effects.ts';
import { titleCase } from './wikiText.ts';
import styles from './wiki.module.css';

const RANK: Record<string, string> = {
  basic: 'Basic',
  adept: 'Adept',
  advanced: 'Advanced',
  passive: 'Passive',
};

function rank(id: string): string {
  return RANK[id] ?? id;
}

/** Chips for the ranks found in the data, in Basic, Adept, Advanced, Passive order. */
function rankChips(values: readonly string[]): FilterChip[] {
  const order = Object.keys(RANK);
  const position = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  return [...new Set(values)]
    .sort((a, b) => position(a) - position(b))
    .map((id) => ({ id, label: rank(id) }));
}

/** One chip per value found in the data, in first-seen order, labelled by `label`. */
function chipsFrom(values: readonly string[], label: (id: string) => string): FilterChip[] {
  return [...new Set(values)].map((id) => ({ id, label: label(id) }));
}

/** True when no chip is pressed or one of `ids` is pressed. */
function chipMatch(pressed: readonly string[], ...ids: string[]): boolean {
  return pressed.length === 0 || ids.some((id) => pressed.includes(id));
}

function toggled(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((c) => c !== id) : [...list, id];
}

function matches(query: string, ...texts: (string | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  return q === '' || texts.some((t) => t?.toLowerCase().includes(q));
}

/** A row of toggle chips, styled and built like the Skills screen's filter chips. */
function ChipRow({
  label,
  chips,
  pressed,
  onChange,
}: {
  label: string;
  chips: readonly FilterChip[];
  pressed: readonly string[];
  onChange: (value: string[]) => void;
}) {
  if (chips.length === 0) return null;
  return (
    <ScrollRow as="div" group label={label} wrapOnDesktop>
      {chips.map(({ id, label: chipLabel }) => {
        const on = pressed.includes(id);
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            className={skillStyles.filterChip}
            onClick={() => onChange(toggled(pressed, id))}
          >
            {on ? <Check aria-hidden="true" className={skillStyles.filterIcon} /> : null}
            {chipLabel}
          </button>
        );
      })}
    </ScrollRow>
  );
}

function Search({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <Field label={label}>
      {(control) => (
        <input
          {...control}
          type="search"
          value={value}
          placeholder="Type a name or a word"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

function Entry({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <details className={styles.entry}>
      <summary>
        <span className={styles.entryTitle}>{title}</span>
        {meta ? <span className={styles.entryMeta}>{meta}</span> : null}
      </summary>
      <div className={styles.entryBody}>{children}</div>
    </details>
  );
}

function Empty({ show }: { show: boolean }) {
  return show ? <p role="status">Nothing matches.</p> : null;
}

function Count({ count, one, many }: { count: number; one: string; many: string }) {
  return (
    <p className={styles.count} aria-live="polite">
      {count} {count === 1 ? one : many}
    </p>
  );
}

function SkillsList({ ruleset }: { ruleset: Ruleset }) {
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [subChips, setSubChips] = useState<Partial<Record<string, string[]>>>({});
  const groups: { id: string; title: string }[] = [
    ...['warrior', 'defender', 'rogue', 'utility', 'magic', 'crafting'].map((id) => ({
      id,
      title: archetypeName(ruleset, id),
    })),
    { id: 'multi', title: 'Multi-archetype' },
  ];
  const groupOf = (s: Ruleset['skills'][number]) =>
    s.category === 'multi' ? 'multi' : (s.archetype ?? 'multi');
  const categoryChips = CATEGORIES.filter((c) =>
    ruleset.skills.some((s) => s.category === c.id),
  ).map((c) => ({ id: c.id, label: c.label }));
  // Like the Skills screen's tabs: the finer chips (archetypes, schools, crafts) show when one
  // category is picked, and only apply while they show.
  const only = categories.length === 1 ? categories[0] : undefined;
  const sole = only !== undefined && isCategory(only) ? only : null;
  const soleLabel = CATEGORIES.find((c) => c.id === sole)?.label ?? '';
  const pressedSub = sole ? (subChips[sole] ?? []) : [];
  const shown = ruleset.skills.filter(
    (s) =>
      chipMatch(categories, s.category) &&
      (sole === null || chipMatch(pressedSub, ...skillChipIds(s))) &&
      matches(query, s.name, ...skillParts(s).map((p) => s.parts[p]?.text)),
  );
  return (
    <>
      <div className={styles.filters}>
        <ChipRow
          label="Filter skills by category"
          chips={categoryChips}
          pressed={categories}
          onChange={setCategories}
        />
        {sole ? (
          <ChipRow
            label={`Filter ${soleLabel.toLowerCase()} skills`}
            chips={filterChips(ruleset, sole)}
            pressed={pressedSub}
            onChange={(value) => setSubChips((prev) => ({ ...prev, [sole]: value }))}
          />
        ) : null}
        <Search label="Search skills" value={query} onChange={setQuery} />
      </div>
      <Count count={shown.length} one="skill" many="skills" />
      {groups.map((group) => {
        const list = shown.filter((s) => groupOf(s) === group.id);
        if (list.length === 0) return null;
        return (
          <section key={group.id} className={styles.group}>
            <h2>{titleCase(group.title)}</h2>
            {list.map((skill) => (
              <Entry key={skill.id} title={skillTitle(ruleset, skill)} meta={typeLabel(skill)}>
                {skillParts(skill).map((part) => {
                  const def = skill.parts[part];
                  if (!def) return null;
                  return (
                    <div key={part} className={styles.part}>
                      <h3>{titleCase(partLabel(ruleset, skill, part))}</h3>
                      <p className={styles.partMeta}>
                        {frequencyText(def.frequency)} · {costKindText(def.costKind)}
                      </p>
                      {def.text ? <p>{def.text}</p> : null}
                    </div>
                  );
                })}
              </Entry>
            ))}
          </section>
        );
      })}
      <Empty show={shown.length === 0} />
    </>
  );
}

function costKindText(kind: string): string {
  switch (kind) {
    case 'basic':
      return 'CXP, levels 1 to 10';
    case 'adept':
      return 'Adept: 3 AP x level, up to 5';
    case 'advanced':
      return 'Advanced: 5 AP x level, up to 5';
    case 'encounter':
      return 'Per encounter: 2 AP x level, up to 5';
    case 'passive':
      return 'Passive: 3 AP x level, up to 5';
    case 'mastery':
      return 'Mastery: 10 AP, one level';
    case 'memorization':
      return 'Memorization: 1 AP each';
    default:
      return kind;
  }
}

/** One ability. `level` keeps heading order: h2 inside a top-level entry, h3 one entry deeper. */
function Ability({
  title,
  frequency,
  text,
  level = 2,
}: {
  title: string;
  frequency?: string;
  text: string;
  level?: 2 | 3;
}) {
  const Heading = level === 3 ? 'h3' : 'h2';
  return (
    <div className={styles.part}>
      <Heading>{titleCase(title)}</Heading>
      {frequency ? <p className={styles.partMeta}>{frequencyText(frequency)}</p> : null}
      <p>{text}</p>
    </div>
  );
}

/** Every ancestry starts closed showing its name, like All Professions; tap to open. */
function AncestriesList({ ruleset }: { ruleset: Ruleset }) {
  return (
    <>
      {ruleset.ancestries.ancestries.map((a) => (
        <Entry key={a.id} title={a.name}>
          <dl className={styles.facts}>
            <div>
              <dt>Base infection</dt>
              <dd>{a.baseInfection}</dd>
            </div>
            {a.ages ? (
              <div>
                <dt>Maximum age</dt>
                <dd>{a.maxAge}</dd>
              </div>
            ) : null}
            {a.costumeRequirements && a.costumeRequirements !== 'None' ? (
              <div>
                <dt>Costume</dt>
                <dd>{a.costumeRequirements}</dd>
              </div>
            ) : null}
          </dl>
          {a.passive ? (
            <Ability
              title={`Passive: ${a.passive.sheetName ?? a.passive.name}`}
              text={a.passive.text}
            />
          ) : null}
          <Ability
            title={`Shared ability: ${a.sharedAbility.name}`}
            frequency={a.sharedAbility.frequency}
            text={a.sharedAbility.text}
          />
          {a.subtypes.map((sub) => (
            <Entry key={sub.id} title={sub.name} meta="Subtype">
              {sub.passive ? (
                <Ability title={`Passive: ${sub.passive.name}`} text={sub.passive.text} level={3} />
              ) : null}
              <Ability
                title={sub.ability.name}
                level={3}
                frequency={sub.ability.frequency}
                text={sub.ability.text}
              />
            </Entry>
          ))}
        </Entry>
      ))}
    </>
  );
}

function ProfessionsList({ ruleset }: { ruleset: Ruleset }) {
  return (
    <>
      {ruleset.professions.professions.map((p) => (
        <Entry
          key={p.id}
          title={p.heading}
          meta={p.kind === 'patron' ? `Patron${p.patron ? `: ${p.patron}` : ''}` : 'Profession'}
        >
          <Ability title={`Passive: ${p.passive.name}`} text={p.passive.text} />
          {p.skills.map((s) => (
            <div key={s.id} className={styles.part}>
              <h2>{titleCase(`${s.slot === 'skill-1' ? 'Skill 1' : 'Skill 2'}: ${s.name}`)}</h2>
              <p className={styles.partMeta}>{s.frequencyText ?? frequencyText(s.frequency)}</p>
              {s.text ? <p>{s.text}</p> : null}
              {s.tiers ? (
                <ul>
                  {(['basic', 'adept', 'advanced'] as const).map((tier) => (
                    <li key={tier}>
                      <strong>
                        {rank(tier)} (level {s.tiers?.[tier].minLevel}):
                      </strong>{' '}
                      {s.tiers?.[tier].text}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </Entry>
      ))}
    </>
  );
}

/** Skill name for a mastery skill id, for example "Blood Magic". */
function skillName(ruleset: Ruleset, id: string): string {
  return ruleset.skillsById[id]?.name ?? id;
}

function SpellsList({ ruleset }: { ruleset: Ruleset }) {
  const [query, setQuery] = useState('');
  const [groupChips, setGroupChips] = useState<string[]>([]);
  const [rankPressed, setRankPressed] = useState<string[]>([]);
  const schools = ruleset.ruleset.magicSchools;
  const groupOf = (s: Ruleset['spells'][number]) => (s.mastery ? s.masterySkill : s.school);
  const schoolIds = new Set(ruleset.spells.flatMap((s) => (s.mastery ? [] : [s.school])));
  const groupChipList: FilterChip[] = [
    ...schools.filter((s) => schoolIds.has(s.id)).map((s) => ({ id: s.id, label: s.name })),
    ...chipsFrom(
      ruleset.spells.flatMap((s) => (s.mastery ? [s.masterySkill] : [])),
      (id) => skillName(ruleset, id),
    ),
  ];
  const shown = ruleset.spells.filter(
    (s) =>
      chipMatch(groupChips, groupOf(s)) &&
      chipMatch(rankPressed, s.rank) &&
      matches(query, s.name, s.text),
  );
  return (
    <>
      <div className={styles.filters}>
        <ChipRow
          label="Filter spells by school"
          chips={groupChipList}
          pressed={groupChips}
          onChange={setGroupChips}
        />
        <ChipRow
          label="Filter spells by rank"
          chips={rankChips(ruleset.spells.map((s) => s.rank))}
          pressed={rankPressed}
          onChange={setRankPressed}
        />
        <Search label="Search spells" value={query} onChange={setQuery} />
      </div>
      <Count count={shown.length} one="spell" many="spells" />
      {schools.map((school) => {
        const list = shown.filter((s) => !s.mastery && s.school === school.id);
        if (list.length === 0) return null;
        return (
          <section key={school.id} className={styles.group}>
            <h2>{titleCase(school.name)}</h2>
            {list.map((s) =>
              s.mastery ? null : (
                <Entry key={s.id} title={s.name} meta={rank(s.rank)}>
                  <p className={styles.partMeta}>
                    Call: {s.call}
                    {s.usesBuffSlot ? ' · Takes a buff slot' : ''}
                  </p>
                  <p>{s.text}</p>
                </Entry>
              ),
            )}
          </section>
        );
      })}
      {shown.some((s) => s.mastery) ? (
        <section className={styles.group}>
          <h2>Mastery Magic</h2>
          {shown.map((s) =>
            s.mastery ? (
              <Entry key={s.id} title={s.name} meta={rank(s.rank)}>
                <p className={styles.partMeta}>
                  Combines{' '}
                  {s.components
                    .map((c) => schools.find((x) => x.id === c)?.name ?? c)
                    .join(' and ')}
                </p>
                <p>{s.text}</p>
              </Entry>
            ) : null,
          )}
        </section>
      ) : null}
      <Empty show={shown.length === 0} />
    </>
  );
}

function RecipesList({ ruleset }: { ruleset: Ruleset }) {
  const [query, setQuery] = useState('');
  const [groupChips, setGroupChips] = useState<string[]>([]);
  const [rankPressed, setRankPressed] = useState<string[]>([]);
  const crafts = ruleset.ruleset.craftingDisciplines;
  const groupOf = (r: Ruleset['recipes'][number]) => (r.mastery ? r.masterySkill : r.discipline);
  const craftIds = new Set(ruleset.recipes.flatMap((r) => (r.mastery ? [] : [r.discipline])));
  const groupChipList: FilterChip[] = [
    ...crafts.filter((c) => craftIds.has(c.id)).map((c) => ({ id: c.id, label: c.name })),
    ...chipsFrom(
      ruleset.recipes.flatMap((r) => (r.mastery ? [r.masterySkill] : [])),
      (id) => skillName(ruleset, id),
    ),
  ];
  const shown = ruleset.recipes.filter(
    (r) =>
      chipMatch(groupChips, groupOf(r)) &&
      chipMatch(rankPressed, r.rank) &&
      matches(query, r.name, r.text),
  );
  return (
    <>
      <div className={styles.filters}>
        <ChipRow
          label="Filter recipes by craft"
          chips={groupChipList}
          pressed={groupChips}
          onChange={setGroupChips}
        />
        <ChipRow
          label="Filter recipes by rank"
          chips={rankChips(ruleset.recipes.map((r) => r.rank))}
          pressed={rankPressed}
          onChange={setRankPressed}
        />
        <Search label="Search recipes" value={query} onChange={setQuery} />
      </div>
      <Count count={shown.length} one="recipe" many="recipes" />
      {crafts.map((craft) => {
        const list = shown.filter((r) => !r.mastery && r.discipline === craft.id);
        if (list.length === 0) return null;
        return (
          <section key={craft.id} className={styles.group}>
            <h2>{titleCase(craft.name)}</h2>
            {list.map((r) => (
              <Entry key={r.id} title={r.name} meta={rank(r.rank)}>
                <p className={styles.partMeta}>Costs {r.costText}</p>
                <p>{r.text}</p>
              </Entry>
            ))}
          </section>
        );
      })}
      {shown.some((r) => r.mastery) ? (
        <section className={styles.group}>
          <h2>Mastery Crafting</h2>
          {shown.map((r) =>
            r.mastery ? (
              <Entry key={r.id} title={r.name} meta={rank(r.rank)}>
                <p className={styles.partMeta}>Costs {r.costText}</p>
                <p>{r.text}</p>
              </Entry>
            ) : null,
          )}
        </section>
      ) : null}
      <Empty show={shown.length === 0} />
    </>
  );
}

function PerformancesList({ ruleset }: { ruleset: Ruleset }) {
  const { performances, rituals } = ruleset.performances;
  const [tierPressed, setTierPressed] = useState<string[]>([]);
  const [frequencyPressed, setFrequencyPressed] = useState<string[]>([]);
  const shownPerformances = performances.filter((p) => chipMatch(tierPressed, p.tier));
  const shownRituals = rituals.filter((r) => chipMatch(frequencyPressed, r.frequency));
  return (
    <>
      <section className={styles.group}>
        <h2>Bardic Performances</h2>
        <ChipRow
          label="Filter performances by rank"
          chips={rankChips(performances.map((p) => p.tier))}
          pressed={tierPressed}
          onChange={setTierPressed}
        />
        <Count count={shownPerformances.length} one="performance" many="performances" />
        {shownPerformances.map((p) => (
          <Entry key={p.id} title={p.name} meta={rank(p.tier)}>
            <p className={styles.partMeta}>
              {p.lengthMinutes.min === p.lengthMinutes.max
                ? `${p.lengthMinutes.min} minutes`
                : `${p.lengthMinutes.min} to ${p.lengthMinutes.max} minutes`}
            </p>
            <p>{p.text}</p>
          </Entry>
        ))}
      </section>
      <section className={styles.group}>
        <h2>Rituals</h2>
        <ChipRow
          label="Filter rituals by how often they work"
          chips={chipsFrom(
            rituals.map((r) => r.frequency),
            (id) => frequencyText(id),
          )}
          pressed={frequencyPressed}
          onChange={setFrequencyPressed}
        />
        <Count count={shownRituals.length} one="ritual" many="rituals" />
        {shownRituals.map((r) => (
          <Entry key={r.id} title={r.name} meta={frequencyText(r.frequency)}>
            <p>{r.text}</p>
          </Entry>
        ))}
      </section>
    </>
  );
}

function FamiliarList({ ruleset }: { ruleset: Ruleset }) {
  const tiers = [...new Set(ruleset.familiar.skills.map((s) => s.tier))].sort((a, b) => a - b);
  return (
    <>
      <section className={styles.group}>
        <h2>Awakened Skills</h2>
        <p>An awakened familiar gains one of these.</p>
        {ruleset.familiar.awakenedSkills.map((s) => (
          <Entry key={s.id} title={s.name} meta={frequencyText(s.frequency)}>
            <p>{s.text}</p>
          </Entry>
        ))}
      </section>
      {tiers.map((tier) => (
        <section key={tier} className={styles.group}>
          <h2>Tier {tier} Skills</h2>
          {ruleset.familiar.skills
            .filter((s) => s.tier === tier)
            .map((s) => (
              <Entry key={s.id} title={s.name} meta={`${s.costEssence} Essence`}>
                <p className={styles.partMeta}>{frequencyText(s.frequency)}</p>
                <p>{s.text}</p>
              </Entry>
            ))}
        </section>
      ))}
    </>
  );
}

function EffectsList() {
  const [query, setQuery] = useState('');
  const [pressed, setPressed] = useState<string[]>([]);
  const sorted = [...EFFECTS].sort((a, b) => a.name.localeCompare(b.name));
  const shown = sorted.filter(
    (e) => chipMatch(pressed, ...e.marks) && matches(query, e.name, e.text),
  );
  return (
    <section className={styles.group}>
      <p>{EFFECTS_INTRO}</p>
      <Search value={query} onChange={setQuery} label="Search effects" />
      <ChipRow
        label="Filter effects by mark"
        chips={EFFECT_MARKS}
        pressed={pressed}
        onChange={setPressed}
      />
      <Count count={shown.length} one="effect" many="effects" />
      <Empty show={shown.length === 0} />
      {shown.map((e) => (
        <Entry
          key={e.id}
          title={[e.name, ...e.marks.map((m) => `(${m})`)].join(' ')}
          meta={`Rulebook p.${e.page}`}
        >
          {e.marks.length > 0 ? (
            <p className={styles.partMeta}>
              {e.marks
                .map((m) => EFFECT_MARKS.find((x) => x.id === m)?.label.replace(/^\(\w\) /, ''))
                .join(', ')}
            </p>
          ) : null}
          <p>{e.text}</p>
        </Entry>
      ))}
    </section>
  );
}

export function ReferenceList({
  list,
  ruleset,
}: {
  list: NonNullable<Article['list']>;
  ruleset: Ruleset;
}) {
  switch (list) {
    case 'skills':
      return <SkillsList ruleset={ruleset} />;
    case 'ancestries':
      return <AncestriesList ruleset={ruleset} />;
    case 'professions':
      return <ProfessionsList ruleset={ruleset} />;
    case 'spells':
      return <SpellsList ruleset={ruleset} />;
    case 'recipes':
      return <RecipesList ruleset={ruleset} />;
    case 'performances':
      return <PerformancesList ruleset={ruleset} />;
    case 'familiar':
      return <FamiliarList ruleset={ruleset} />;
    case 'effects':
      return <EffectsList />;
  }
}
