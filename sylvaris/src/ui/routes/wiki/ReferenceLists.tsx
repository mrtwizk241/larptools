// Reference pages built from the Sylvaris rules data the sheet uses, so they always match it.
// Each list has a search (prefilled from `?q=`), a group filter, and closed entries that open
// on tap. Entries are plain <details>, cheap enough to render every one at once.
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import type { SySkill } from '../../../data/index.ts';
import { Field } from '../../components/index.ts';
import type { ReferenceListId } from './articles.ts';
import { filterEntries, referenceList, type RefEntry } from './referenceData.ts';
import {
  NAMED_LEVELS,
  abilityKind,
  frequencyText,
  humanize,
  levelName,
  prereqText,
  skillName,
  usesText,
  type WikiRuleset,
} from './wikiData.ts';
import styles from './wiki.module.css';

function Facts({ items }: { items: [string, ReactNode][] }) {
  const shown = items.filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (shown.length === 0) return null;
  return (
    <dl className={styles.facts}>
      {shown.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Source({ text }: { text: string }) {
  return <p className={styles.partMeta}>Source: {text}</p>;
}

function SkillLevels({
  rs,
  skill,
  heading: H,
}: {
  rs: WikiRuleset;
  skill: SySkill;
  heading: 'h3' | 'h4';
}) {
  return (
    <>
      {NAMED_LEVELS.map((level) => {
        const ability = skill.levels[level];
        return (
          <div key={level} className={styles.part}>
            <H>
              {levelName(level)} (level {rs.ruleset.skills.namedLevels[level]})
            </H>
            <p className={styles.partMeta}>
              {ability.kind === 'passive'
                ? 'Passive'
                : `${usesText(ability.uses)}, ${abilityKind(ability.kind).toLowerCase()}`}
              {level === 'basic' ? '' : `. Needs the ${levelName(level)} Technique`}
            </p>
            <p>{ability.summary}</p>
          </div>
        );
      })}
    </>
  );
}

function SkillFacts({ rs, skill }: { rs: WikiRuleset; skill: SySkill }) {
  return (
    <>
      {skill.advanced ? (
        <p>
          <strong>Advanced.</strong> Needs: {prereqText(rs, skill)}
        </p>
      ) : null}
      {skill.requirement ? (
        <p>
          <strong>Requirement:</strong> {skill.requirement}
        </p>
      ) : null}
      {skill.defenseType ? (
        <p>
          <strong>Defense type:</strong> {humanize(skill.defenseType)}
        </p>
      ) : null}
    </>
  );
}

function SkillBody({ rs, id }: { rs: WikiRuleset; id: string }) {
  const skill = rs.skillsById[id];
  if (!skill) return null;
  return (
    <>
      <SkillFacts rs={rs} skill={skill} />
      <SkillLevels rs={rs} skill={skill} heading="h3" />
      <Source text={skill.source} />
    </>
  );
}

function NestedSkill({ rs, skill, label }: { rs: WikiRuleset; skill: SySkill; label: string }) {
  return (
    <div className={styles.part}>
      <h3>
        {label}: {skill.name}
      </h3>
      <SkillFacts rs={rs} skill={skill} />
      <SkillLevels rs={rs} skill={skill} heading="h4" />
      <Source text={skill.source} />
    </div>
  );
}

function choiceText(
  rs: WikiRuleset,
  choice: {
    kind: string;
    options?: readonly string[] | undefined;
    summary?: string | undefined;
  },
): string {
  const parts: string[] = [];
  if (choice.options)
    parts.push(
      choice.options
        .map((o) => rs.ruleset.languages.find((l) => l.id === o)?.name ?? humanize(o))
        .join(', '),
    );
  else if (choice.kind === 'language') parts.push('Any language');
  else if (choice.kind === 'racial-passive') parts.push("Another race's innate passive");
  else if (choice.kind === 'racial-skill') parts.push("Another race's racial skill");
  else if (choice.kind === 'spell-list') parts.push('Spells you name');
  else parts.push('You describe it');
  if (choice.summary) parts.push(choice.summary);
  return parts.join('. ');
}

function RaceBody({ rs, id }: { rs: WikiRuleset; id: string }) {
  const race = rs.racesById[id];
  if (!race) return null;
  const language = rs.ruleset.languages.find((l) => l.id === race.language)?.name ?? race.language;
  return (
    <>
      <p>{race.summary}</p>
      <p>
        <strong>Makeup:</strong> {race.makeup}
      </p>
      <Facts
        items={[
          ['Size', race.size === 'choice' ? 'You choose' : humanize(race.size)],
          ['Lifespan', humanize(race.lifespan)],
          ['Language', language],
        ]}
      />
      <div className={styles.part}>
        <h3>Innate abilities</h3>
        <ul>
          {race.innate.map((innate) => (
            <li key={innate.id}>
              <strong>
                {innate.kind === 'passive'
                  ? 'Passive'
                  : `Active, ${frequencyText(innate.frequency ?? 'other').toLowerCase()}${
                      innate.uses ? `, ${usesText(innate.uses)}` : ''
                    }`}
                :
              </strong>{' '}
              {innate.summary}
            </li>
          ))}
        </ul>
      </div>
      {race.choices.length > 0 ? (
        <div className={styles.part}>
          <h3>Choices at creation</h3>
          <ul>
            {race.choices.map((c) => (
              <li key={c.id}>
                <strong>{c.label}:</strong> {choiceText(rs, c)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {race.elements ? (
        <div className={styles.part}>
          <h3>Elements</h3>
          <ul>
            {race.elements.map((e) => (
              <li key={e.id}>
                <strong>{humanize(e.id)}</strong> ({e.baseColor}): {e.effect} Advanced:{' '}
                {e.advancedEffect}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {race.skills.map((skill) => (
        <NestedSkill key={skill.id} rs={rs} skill={skill} label="Racial skill" />
      ))}
      {race.notes?.map((note) => (
        <p key={note} className={styles.partMeta}>
          Note: {note}
        </p>
      ))}
      <Source text={race.source} />
    </>
  );
}

function CallingBody({ rs, id }: { rs: WikiRuleset; id: string }) {
  const calling = rs.callingsById[id];
  if (!calling) return null;
  return (
    <>
      <p>{calling.summary}</p>
      <div className={styles.part}>
        <h3>Innate: {calling.innate.name}</h3>
        <p>{calling.innate.summary}</p>
      </div>
      {calling.detriment ? (
        <div className={styles.part}>
          <h3>Detriment</h3>
          <p>{calling.detriment.summary}</p>
        </div>
      ) : null}
      {calling.choices && calling.choices.length > 0 ? (
        <div className={styles.part}>
          <h3>Choices</h3>
          <ul>
            {calling.choices.map((c) => (
              <li key={c.id}>
                <strong>{c.label}:</strong> {choiceText(rs, c)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {calling.skills.map((skill) => (
        <NestedSkill key={skill.id} rs={rs} skill={skill} label="Calling skill" />
      ))}
      <Source text={calling.source} />
    </>
  );
}

function SpellBody({ rs, id }: { rs: WikiRuleset; id: string }) {
  const spell = rs.spellsById[id];
  if (!spell) return null;
  return (
    <>
      <Facts
        items={[
          ['Cost', usesText(spell.uses)],
          ['Delivery', humanize(spell.delivery)],
          ['Enhancement Slot', spell.enhancement ? 'Yes (E)' : 'No'],
        ]}
      />
      <p>{spell.summary}</p>
      <Source text={spell.source} />
    </>
  );
}

function RitualBody({ rs, id }: { rs: WikiRuleset; id: string }) {
  const ritual = rs.ritualsById[id];
  if (!ritual) return null;
  const needs = ritual.requiredMagic
    ? ritual.requiredMagic.map((m) => skillName(rs, m)).join(', ')
    : ritual.requiredMagicRule === 'planar-chart'
      ? 'Depends on the plane (see the Planar Chart on the Magic page)'
      : 'The magic of the element being imbued';
  return (
    <>
      <Facts
        items={[
          ['Cost', usesText(ritual.uses)],
          ['Casting time', `${ritual.castMinutes} minutes`],
          ['Enhancement Slot', ritual.enhancement ? 'Yes (E)' : 'No'],
        ]}
      />
      <p>
        <strong>Needs:</strong> {needs}, each at the {levelName(ritual.requiredTechnique)} Technique
        or better.
      </p>
      {ritual.aliases ? <p>Also called {ritual.aliases.join(', ')}.</p> : null}
      <p>{ritual.summary}</p>
      {ritual.elementBonus ? (
        <ul>
          {Object.entries(ritual.elementBonus).map(([element, bonus]) => (
            <li key={element}>
              <strong>{humanize(element)}:</strong> {bonus}
            </li>
          ))}
        </ul>
      ) : null}
      <Source text={ritual.source} />
    </>
  );
}

function stableCostText(cost: { basic: number; exotic: number; uncutGem?: number | undefined }) {
  const parts: string[] = [];
  if (cost.basic > 0) parts.push(`${cost.basic} Basic`);
  if (cost.exotic > 0) parts.push(`${cost.exotic} Exotic`);
  if (cost.uncutGem) parts.push(`${cost.uncutGem} uncut gem`);
  return parts.length ? parts.join(' + ') : 'No components';
}

function RecipeBody({ rs, id }: { rs: WikiRuleset; id: string }) {
  const recipe = rs.recipesById[id];
  if (!recipe) return null;
  return (
    <>
      <Facts
        items={[
          ['Cost', usesText(recipe.uses)],
          ['Kind', humanize(recipe.itemCategory)],
          ['Stable cost', stableCostText(recipe.stableCost)],
          ['Unstable allowed', recipe.unstableAllowed ? 'Yes' : 'No'],
          ['Enhancement Slot', recipe.enhancement ? 'Yes (E)' : 'No'],
          ['Augment Slots', recipe.augmentSlots],
        ]}
      />
      <p>{recipe.summary}</p>
      <Source text={recipe.source} />
    </>
  );
}

function PerformanceBody({ rs, id }: { rs: WikiRuleset; id: string }) {
  const p = rs.performancesById[id];
  if (!p) return null;
  return (
    <>
      <Facts
        items={[
          ['Cost', usesText(p.uses)],
          ['Enhancement Slot', p.enhancement ? 'Yes (E)' : 'No'],
        ]}
      />
      <p>{p.summary}</p>
      <Source text={p.source} />
    </>
  );
}

const STARTING_CHOICE: Record<string, string> = {
  'weapon-type': 'You name the weapon type.',
  element: 'You name the element.',
  spell: 'You name the Basic spell.',
  recipe: 'You name the Basic recipe.',
  craft: 'You name the craft.',
  performance: 'You name the Basic performance.',
};

function StartingBody({ rs, id }: { rs: WikiRuleset; id: string }) {
  const o = rs.startingOptionsById[id];
  if (!o) return null;
  return (
    <>
      <Facts
        items={[
          ['Quality', o.quality ? levelName(o.quality) : undefined],
          ['Copper', o.copper],
          ['GM approval', o.gmApproval ? 'Needed' : undefined],
        ]}
      />
      {o.choice ? <p>{STARTING_CHOICE[o.choice]}</p> : null}
      <Source text={rs.startingEquipment.source} />
    </>
  );
}

function ArtifactBody({ rs, id }: { rs: WikiRuleset; id: string }) {
  const p = rs.artifactPowersById[id];
  if (!p) return null;
  return (
    <>
      <Facts
        items={[
          ['Slots', p.tier],
          ['When', frequencyText(p.frequency)],
          ['You name', p.choice ? humanize(p.choice) : undefined],
          ['Most per Artifact', p.maxPerArtifact],
          ['GM approval', p.gmApproval ? 'Needed' : undefined],
        ]}
      />
      <p>{p.summary}</p>
      {p.choiceOptions ? <p>Options: {p.choiceOptions.map(humanize).join(', ')}.</p> : null}
      <Source text={p.source} />
    </>
  );
}

function TrickBody({ rs, id }: { rs: WikiRuleset; id: string }) {
  const t = rs.specialTricksById[id];
  if (!t) return null;
  return (
    <>
      <Facts
        items={[
          ['When', frequencyText(t.frequency)],
          ['Uses', t.uses],
        ]}
      />
      <p>{t.summary}</p>
      {t.choice ? <p>Options: {t.choice.map(humanize).join(', ')}.</p> : null}
      <Source text={t.source} />
    </>
  );
}

const BODIES: Record<ReferenceListId, (props: { rs: WikiRuleset; id: string }) => ReactNode> = {
  skills: SkillBody,
  races: RaceBody,
  callings: CallingBody,
  spells: SpellBody,
  rituals: RitualBody,
  recipes: RecipeBody,
  performances: PerformanceBody,
  'starting-equipment': StartingBody,
  'artifact-powers': ArtifactBody,
  'familiar-tricks': TrickBody,
};

function Intro({ list, rs }: { list: ReferenceListId; rs: WikiRuleset }) {
  switch (list) {
    case 'starting-equipment':
      return (
        <p>
          A new character picks {rs.startingEquipment.picks} of these
          {rs.startingEquipment.duplicatesAllowed ? ' and may pick one more than once' : ''}.
        </p>
      );
    case 'skills':
      return (
        <p>
          Racial skills are on the list of races and Calling skills on the list of Callings. Each
          named ability above Basic needs its Technique.
        </p>
      );
    default:
      return null;
  }
}

function Entry({ entry, children }: { entry: RefEntry; children: ReactNode }) {
  return (
    <details className={styles.entry} id={`entry-${entry.id}`}>
      <summary>
        <span className={styles.entryTitle}>{entry.title}</span>
        {entry.meta ? <span className={styles.entryMeta}>{entry.meta}</span> : null}
      </summary>
      <div className={styles.entryBody}>{children}</div>
    </details>
  );
}

export function ReferenceList({
  list,
  rs,
  controls = true,
}: {
  list: ReferenceListId;
  rs: WikiRuleset;
  /** False in the downloaded HTML copy, which has no script to run a search. */
  controls?: boolean;
}) {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const [group, setGroup] = useState('');
  const data = referenceList(rs, list);
  const [singular, plural] = data.noun;
  const shown = filterEntries(data.entries, query).filter((e) => group === '' || e.group === group);
  const Body = BODIES[list];
  return (
    <>
      <Intro list={list} rs={rs} />
      {controls ? (
        <div className={styles.filters}>
          <Field label={`Search ${plural}`}>
            {(control) => (
              <input
                {...control}
                type="search"
                value={query}
                placeholder="Type a name or a word"
                onChange={(event) => setQuery(event.target.value)}
              />
            )}
          </Field>
          {data.groups.length > 1 ? (
            <Field label="Show">
              {(control) => (
                <select {...control} value={group} onChange={(e) => setGroup(e.target.value)}>
                  <option value="">All groups</option>
                  {data.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ) : null}
        </div>
      ) : null}
      <p className={styles.count} aria-live="polite">
        {shown.length} {shown.length === 1 ? singular : plural}
      </p>
      {data.groups.map((g) => {
        const entries = shown.filter((e) => e.group === g.id);
        if (entries.length === 0) return null;
        return (
          <section key={g.id} className={styles.group} aria-labelledby={`ref-${g.id}`}>
            <h2 id={`ref-${g.id}`}>{g.title}</h2>
            {entries.map((entry) => (
              <Entry key={entry.id} entry={entry}>
                <Body rs={rs} id={entry.id} />
              </Entry>
            ))}
          </section>
        );
      })}
      {shown.length === 0 ? <p role="status">Nothing matches.</p> : null}
      {list === 'artifact-powers' ? (
        <section className={styles.group} aria-labelledby="ref-conditions">
          <h2 id="ref-conditions">Allowed conditions</h2>
          <p>
            Powers that give immunity to a condition may only name one of these (
            {rs.artifacts.allowedConditionsSource}).
          </p>
          <ul className={styles.plainList}>
            {rs.artifacts.allowedConditions.map((c) => (
              <li key={c.id}>{c.label}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
