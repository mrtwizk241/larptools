// `#/c/:id/skills`: skills by category, with points, search, "Owned only", levels, Technique
// badges, and advanced and locked marks. Players ask for a learning with "+ Request".
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronRight, Lock, Plus } from 'lucide-react';
import type { Sheet } from '../../../../engine/index.ts';
import { Button, Field, Tabs } from '../../../components/index.ts';
import { LOCAL_MODE } from '../../../../localMode.ts';
import { ExpandItem } from '../ExpandItem.tsx';
import type { CharacterScreenProps } from '../screen.tsx';
import type { CharacterView } from '../view.ts';
import { RequestSkillDialog } from './RequestSkillDialog.tsx';
import { SkillAbilities } from './SkillAbilities.tsx';
import { SkillControls } from './SkillControls.tsx';
import {
  CATEGORIES,
  canRequest,
  defaultCategory,
  filterSkills,
  isCategory,
  isLockedSkill,
  levelText,
  namedLabel,
  ownedSkill,
  prereqsMissing,
  requestable,
  skillName,
  usesText,
  type Skill,
  type SkillCategory,
} from './skillInfo.ts';
import characterStyles from '../character.module.css';
import expand from '../expand.module.css';
import styles from './skills.module.css';

/** Skills list. Tab and "Owned only" live in the address, so the way back keeps them. */
export function SkillsPage({ view }: CharacterScreenProps) {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: SkillCategory = isCategory(tabParam) ? tabParam : defaultCategory(view.sheet);
  const [query, setQuery] = useState('');
  const ownedParam = params.get('owned');
  // Players start with Owned only on, staff with it off.
  const [ownedOnly, setOwnedOnlyState] = useState(
    ownedParam === null ? !view.isStaff : ownedParam === '1',
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
                label={category.label}
                query={query}
                onQuery={setQuery}
                ownedOnly={ownedOnly}
                onOwnedOnly={setOwnedOnly}
              />
            ) : null,
        }))}
      />
    </section>
  );
}

/** XP (and CXP on the Calling tab) on one compact mono line, full wording for screen readers. */
export function PointsLine({ sheet, calling }: { sheet: Sheet; calling: boolean }) {
  const items = [{ short: 'XP', full: 'XP', value: sheet.points.xp.available }];
  if (calling) items.push({ short: 'CXP', full: 'Calling XP', value: sheet.points.cxp.available });
  return (
    <ul className={styles.points} aria-label="Points available">
      {items.map((item) => (
        <li key={item.short} className={item.value < 0 ? styles.pointOver : undefined}>
          <span aria-hidden="true">
            {item.short} <span className={styles.pointValue}>{item.value}</span>
            {item.value < 0 ? ' over' : ''}
          </span>
          <span className="visually-hidden">{`${item.full} ${item.value} available`}</span>
        </li>
      ))}
    </ul>
  );
}

interface SkillTabProps {
  view: CharacterView;
  category: SkillCategory;
  label: string;
  query: string;
  onQuery: (value: string) => void;
  ownedOnly: boolean;
  onOwnedOnly: (value: boolean) => void;
}

function emptyText(view: CharacterView, category: SkillCategory, label: string): string {
  if (category === 'calling' && !view.sheet.calling && view.sheet.formerCallings.length === 0)
    return 'No Calling started yet.';
  if (category === 'racial' && !view.sheet.race) return 'No race chosen yet.';
  return `No ${label.toLowerCase()} skills learned yet.`;
}

function SkillTab({
  view,
  category,
  label,
  query,
  onQuery,
  ownedOnly,
  onOwnedOnly,
}: SkillTabProps) {
  const { ruleset, sheet } = view;
  const [adding, setAdding] = useState<Skill | null>(null);
  const skills = filterSkills(ruleset, sheet, { category, query, ownedOnly });
  const searching = query.trim() !== '';

  return (
    <div className={styles.tabBody}>
      <PointsLine sheet={sheet} calling={category === 'calling'} />
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
      {skills.length > 0 ? (
        <ul className={LOCAL_MODE ? expand.list : characterStyles.list}>
          {skills.map((skill) => (
            <SkillRow
              key={skill.id}
              view={view}
              skill={skill}
              ownedOnly={ownedOnly}
              onRequest={() => setAdding(skill)}
            />
          ))}
        </ul>
      ) : (
        <p>{ownedOnly && !searching ? emptyText(view, category, label) : 'No skills match.'}</p>
      )}
      <p className={styles.count} aria-live="polite">
        {skills.length === 1 ? '1 skill' : `${skills.length} skills`}
      </p>
      {canRequest(view) ? (
        <p className={styles.hint}>
          Learned something in game? Tap Request next to the skill and say who taught you. To find a
          skill you do not have yet, turn off Owned only.
        </p>
      ) : null}
      {adding ? (
        <RequestSkillDialog view={view} skill={adding} onClose={() => setAdding(null)} />
      ) : null}
    </div>
  );
}

function SkillRow({
  view,
  skill,
  ownedOnly,
  onRequest,
}: {
  view: CharacterView;
  skill: Skill;
  ownedOnly: boolean;
  onRequest: () => void;
}) {
  const { ruleset, sheet } = view;
  const owned = ownedSkill(sheet, skill.id);
  const locked = isLockedSkill(sheet, skill);
  const blocked = !locked && (owned?.level ?? 0) === 0 && prereqsMissing(ruleset, sheet, skill);
  const addable = requestable(view, skill);
  if (LOCAL_MODE) return <PlaygroundSkillRow view={view} skill={skill} />;
  return (
    <li className={addable ? styles.rowWithAdd : styles.rowItem}>
      <Link
        to={`/c/${view.id}/skills/${skill.id}${ownedOnly ? '?owned=1' : '?owned=0'}`}
        className={characterStyles.row}
      >
        <span className={styles.rowMain}>
          <span className={styles.rowName}>{skillName(ruleset, sheet, skill.id)}</span>
          <span className={styles.rowMeta}>
            <span className={styles.level}>{levelText(owned)}</span>
            {owned && owned.level > 0 ? <span>{usesText(owned.maxUses)}</span> : null}
            {owned?.techniques.map((t) => (
              <span key={t} className={`${styles.tag} ${styles.tagStrong}`}>
                {namedLabel(t)}
              </span>
            ))}
            {skill.advanced ? <span className={styles.tag}>Advanced</span> : null}
            {locked ? (
              <span className={styles.tag}>
                <Lock aria-hidden="true" className={styles.tagIcon} />
                Locked
              </span>
            ) : null}
            {blocked ? (
              <span className={styles.tag}>
                <Lock aria-hidden="true" className={styles.tagIcon} />
                Needs prerequisites
              </span>
            ) : null}
          </span>
        </span>
        <ChevronRight aria-hidden="true" className={characterStyles.chevron} />
      </Link>
      {addable ? (
        <Button
          className={styles.addButton}
          icon={<Plus />}
          aria-label={`Request ${skillName(ruleset, sheet, skill.id)}`}
          onClick={onRequest}
        >
          Request
        </Button>
      ) : null}
    </li>
  );
}

/** The tags under a skill name in the no-login builds: uses, advanced, and lock marks. */
function RowTags({ view, skill }: { view: CharacterView; skill: Skill }) {
  const { ruleset, sheet } = view;
  const owned = ownedSkill(sheet, skill.id);
  const locked = isLockedSkill(sheet, skill);
  const blocked = !locked && (owned?.level ?? 0) === 0 && prereqsMissing(ruleset, sheet, skill);
  if (!(owned && owned.level > 0) && !skill.advanced && !locked && !blocked) return null;
  return (
    <>
      {owned && owned.level > 0 ? <span>{usesText(owned.maxUses)}</span> : null}
      {skill.advanced ? <span className={styles.tag}>Advanced</span> : null}
      {locked ? (
        <span className={styles.tag}>
          <Lock aria-hidden="true" className={styles.tagIcon} />
          Locked
        </span>
      ) : null}
      {blocked ? (
        <span className={styles.tag}>
          <Lock aria-hidden="true" className={styles.tagIcon} />
          Needs prerequisites
        </span>
      ) : null}
    </>
  );
}

/**
 * The no-login builds' skill row (as on Rustwater): the name with round - and + groups for the
 * level and each Technique (beside the name on wide rows, under it on phones). Opening the row
 * shows what each named ability does.
 */
function PlaygroundSkillRow({ view, skill }: { view: CharacterView; skill: Skill }) {
  const { ruleset, sheet } = view;
  return (
    <li>
      <ExpandItem
        title={skillName(ruleset, sheet, skill.id)}
        meta={<RowTags view={view} skill={skill} />}
        controls={<SkillControls view={view} skill={skill} />}
      >
        {() => <SkillAbilities view={view} skill={skill} />}
      </ExpandItem>
    </li>
  );
}
