import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Check, TriangleAlert } from 'lucide-react';
import type { Ruleset, Sheet } from '../../../../engine/index.ts';
import { Field, ScrollRow, Tabs } from '../../../components/index.ts';
import { ExpandItem } from '../ExpandItem.tsx';
import type { CharacterView } from '../view.ts';
import { canRequest } from './requestParts.ts';
import { SkillControls } from './SkillControls.tsx';
import { SkillPanel } from './SkillPanel.tsx';
import {
  CATEGORIES,
  archetypeName,
  filterChips,
  filterSkills,
  isCategory,
  poolsForCategory,
  skillTitle,
  typeLabel,
  type SkillCategory,
} from './skillInfo.ts';
import characterStyles from '../character.module.css';
import expand from '../expand.module.css';
import styles from './skills.module.css';

/**
 * `#/c/:id/skills`: skills by category, with filter chips (kept per tab), search, and "Owned only". Each skill
 * opens in place; `?open=<skillId>` opens one (and picks its tab) when the page loads.
 */
export function SkillsPage({ view }: { view: CharacterView }) {
  const [params, setParams] = useSearchParams();
  const openId = params.get('open');
  const openSkill = openId ? view.ruleset.skillsById[openId] : undefined;
  const tabParam = params.get('tab') ?? openSkill?.category ?? null;
  const tab: SkillCategory = isCategory(tabParam) ? tabParam : 'standard';
  const [query, setQuery] = useState('');
  // Owned only lives in the address (`owned=1`/`0`), so a skill's page and the way back keep it.
  // Players start with it on, staff with it off.
  const ownedParam = params.get('owned');
  // Local state answers the tap at once; the address keeps it for the way back.
  const [ownedOnly, setOwnedOnlyState] = useState(
    ownedParam === null ? !view.isStaff && !openSkill : ownedParam === '1',
  );
  const update = (changes: Record<string, string>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) next.set(key, value);
        return next;
      },
      { replace: true },
    );
  const setOwnedOnly = (value: boolean) => {
    setOwnedOnlyState(value);
    update({ owned: value ? '1' : '0' });
  };
  const [chipsByTab, setChipsByTab] = useState<Partial<Record<SkillCategory, string[]>>>({});

  return (
    <section aria-labelledby="skills-heading" className={characterStyles.section}>
      <h2 id="skills-heading">Skills</h2>
      <Tabs
        label="Skill categories"
        selectedId={tab}
        onSelect={(id) => update({ tab: id })}
        tabs={CATEGORIES.map((category) => ({
          id: category.id,
          label: category.label,
          content:
            category.id === tab ? (
              <SkillTab
                view={view}
                category={category.id}
                query={query}
                onQuery={setQuery}
                ownedOnly={ownedOnly}
                onOwnedOnly={setOwnedOnly}
                chips={chipsByTab[category.id] ?? []}
                onChips={(chips) => setChipsByTab((prev) => ({ ...prev, [category.id]: chips }))}
                openId={openSkill ? openSkill.id : null}
              />
            ) : null,
        }))}
      />
    </section>
  );
}

interface PoolItem {
  /** Short visible text, for example "W". */
  short: string;
  /** Full wording for screen readers, for example "Warrior AP". */
  full: string;
  value: number;
}

/** Visible pool abbreviations: the first letter, or the full name when two share a letter. */
function poolItems(ruleset: Ruleset, sheet: Sheet, pools: readonly string[]): PoolItem[] {
  const names = pools.map((id) => archetypeName(ruleset, id));
  const initials = names.map((name) => name.charAt(0).toUpperCase());
  return [
    { short: 'CXP', full: 'CXP', value: sheet.points.cxp.available },
    ...pools.map((id, i) => {
      const initial = initials[i] ?? '';
      const name = names[i] ?? id;
      const unique = initials.indexOf(initial) === initials.lastIndexOf(initial);
      return {
        short: unique ? initial : name,
        full: `${name} AP`,
        value: sheet.points.ap[id]?.available ?? 0,
      };
    }),
  ];
}

/**
 * CXP and the AP pools a category's skills use, on one compact mono line, for example
 * `CXP 190 · W 3 · D 0`. Screen readers hear the full wording ("Warrior AP 3 available").
 */
export function PoolSummary({
  ruleset,
  sheet,
  pools,
  label = 'Points available',
}: {
  ruleset: Ruleset;
  sheet: Sheet;
  pools: readonly string[];
  label?: string;
}) {
  return (
    <ul className={styles.pools} aria-label={label}>
      {poolItems(ruleset, sheet, pools).map((item) => {
        const over = item.value < 0;
        return (
          <li key={item.full} className={over ? styles.poolOver : undefined}>
            <span aria-hidden="true">
              {item.short} <span className={styles.poolValue}>{item.value}</span>
              {over ? (
                <>
                  {' '}
                  <TriangleAlert className={styles.poolIcon} />
                  over
                </>
              ) : null}
            </span>
            <span className="visually-hidden">
              {`${item.full} ${item.value} available${over ? ', overspent' : ''}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

interface SkillTabProps {
  view: CharacterView;
  category: SkillCategory;
  query: string;
  onQuery: (value: string) => void;
  ownedOnly: boolean;
  onOwnedOnly: (value: boolean) => void;
  /** Pressed filter chip ids for this tab; empty shows all. */
  chips: string[];
  onChips: (value: string[]) => void;
  openId: string | null;
}

function SkillTab({
  view,
  category,
  query,
  onQuery,
  ownedOnly,
  onOwnedOnly,
  chips,
  onChips,
  openId,
}: SkillTabProps) {
  const { ruleset, sheet } = view;
  const skills = filterSkills(ruleset, sheet, { category, chips, query, ownedOnly });
  const label = CATEGORIES.find((c) => c.id === category)?.label ?? category;
  const chipList = filterChips(ruleset, category);
  const toggle = (id: string) =>
    onChips(chips.includes(id) ? chips.filter((c) => c !== id) : [...chips, id]);

  return (
    <div className={`${styles.tabBody} ${styles.listBody}`}>
      <PoolSummary
        ruleset={ruleset}
        sheet={sheet}
        pools={poolsForCategory(ruleset, category)}
        label={`${label} points available`}
      />
      {chipList.length > 0 ? (
        <ScrollRow as="div" group label={`Filter ${label.toLowerCase()} skills`} wrapOnDesktop>
          {chipList.map(({ id, label: chipLabel }) => {
            const pressed = chips.includes(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={pressed}
                className={styles.filterChip}
                onClick={() => toggle(id)}
              >
                {pressed ? <Check aria-hidden="true" className={styles.filterIcon} /> : null}
                {chipLabel}
              </button>
            );
          })}
        </ScrollRow>
      ) : null}
      <div className={styles.searchRow}>
        <Field label={`Search ${label.toLowerCase()} skills`} className={styles.search ?? ''}>
          {(control) => (
            <input
              {...control}
              type="search"
              autoComplete="off"
              placeholder="Skill name"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
            />
          )}
        </Field>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={ownedOnly}
            onChange={(event) => onOwnedOnly(event.target.checked)}
          />
          <span>Owned only</span>
        </label>
      </div>
      <p className={styles.count} aria-live="polite">
        {skills.length === 1 ? '1 skill' : `${skills.length} skills`}
      </p>
      {canRequest(view) ? (
        <p className={styles.hint}>
          Learned a skill in game? Tap + next to the level you learned and say who taught you. To
          find a skill you do not have yet, turn off Owned only.
        </p>
      ) : null}
      {skills.length > 0 ? (
        <ul className={expand.list}>
          {skills.map((skill) => {
            return (
              <li key={skill.id}>
                <ExpandItem
                  title={skillTitle(ruleset, skill)}
                  defaultOpen={skill.id === openId}
                  controls={<SkillControls view={view} skill={skill} />}
                  meta={<span className={styles.typeBadge}>{typeLabel(skill)}</span>}
                >
                  {() => (
                    <SkillPanel view={view} skill={skill} ownedView={!view.isStaff && ownedOnly} />
                  )}
                </ExpandItem>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>
          {ownedOnly && query.trim() === '' && chips.length === 0
            ? `No ${label.toLowerCase()} skills learned yet.`
            : 'No skills match.'}
        </p>
      )}
    </div>
  );
}
