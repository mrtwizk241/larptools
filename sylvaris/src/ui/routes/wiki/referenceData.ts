// The entries of each reference list, built from the Sylvaris rules data. Used by the list
// pages (ReferenceLists.tsx) and by the wiki home search.
import type { ReferenceListId } from './articles.ts';
import {
  CATEGORY_TITLES,
  NAMED_LEVELS,
  levelName,
  skillName,
  titleFromId,
  type WikiRuleset,
} from './wikiData.ts';

export interface RefGroup {
  id: string;
  title: string;
}

export interface RefEntry {
  id: string;
  title: string;
  /** Short label beside the title, such as a level or "Advanced". */
  meta?: string;
  group: string;
  source: string;
  /** Lowercase text the search matches against. */
  search: string;
}

export interface RefList {
  /** What one entry is called, singular and plural. */
  noun: [string, string];
  groups: RefGroup[];
  entries: RefEntry[];
}

const LEVEL_GROUPS: RefGroup[] = NAMED_LEVELS.map((l) => ({ id: l, title: levelName(l) }));

function text(...parts: (string | undefined)[]): string {
  return parts
    .filter((p): p is string => Boolean(p))
    .join(' ')
    .toLowerCase();
}

export function artifactPowerTitle(id: string): string {
  return titleFromId(id, 'art-').replace(/^Adv /, 'Advanced ');
}

export function familiarTrickTitle(id: string): string {
  return titleFromId(id, 'fam-');
}

export function referenceList(rs: WikiRuleset, list: ReferenceListId): RefList {
  switch (list) {
    case 'skills':
      return {
        noun: ['skill', 'skills'],
        groups: Object.entries(CATEGORY_TITLES).map(([id, title]) => ({ id, title })),
        entries: rs.skills.map((s) => ({
          id: s.id,
          title: s.name,
          ...(s.advanced ? { meta: 'Advanced' } : {}),
          group: s.category,
          source: s.source,
          search: text(
            s.name,
            ...(s.aliases ?? []),
            s.requirement,
            ...NAMED_LEVELS.map((l) => s.levels[l].summary),
          ),
        })),
      };
    case 'races':
      return {
        noun: ['race', 'races'],
        groups: [{ id: 'all', title: 'Races' }],
        entries: rs.races.map((r) => ({
          id: r.id,
          title: r.name,
          group: 'all',
          source: r.source,
          search: text(
            r.name,
            r.summary,
            r.makeup,
            ...r.innate.map((i) => i.summary),
            ...r.skills.map((s) => s.name),
          ),
        })),
      };
    case 'callings':
      return {
        noun: ['Calling', 'Callings'],
        groups: [{ id: 'all', title: 'Callings' }],
        entries: rs.callings.map((c) => ({
          id: c.id,
          title: c.name,
          group: 'all',
          source: c.source,
          search: text(
            c.name,
            c.summary,
            c.innate.name,
            c.innate.summary,
            c.detriment?.summary,
            ...c.skills.map((s) => s.name),
          ),
        })),
      };
    case 'spells':
      return {
        noun: ['spell', 'spells'],
        groups: rs.ruleset.magicSchools.map((m) => ({ id: m.id, title: `${m.name} magic` })),
        entries: rs.spells.map((s) => ({
          id: s.id,
          title: s.name,
          meta: levelName(s.level),
          group: s.school,
          source: s.source,
          search: text(s.name, s.summary),
        })),
      };
    case 'rituals':
      return {
        noun: ['ritual', 'rituals'],
        groups: LEVEL_GROUPS,
        entries: rs.rituals.rituals.map((r) => ({
          id: r.id,
          title: r.name,
          meta: levelName(r.level),
          group: r.level,
          source: r.source,
          search: text(r.name, ...(r.aliases ?? []), r.summary),
        })),
      };
    case 'recipes': {
      const crafts = Object.keys(rs.recipesByCraft);
      return {
        noun: ['recipe', 'recipes'],
        groups: crafts.map((id) => ({ id, title: skillName(rs, id) })),
        entries: rs.recipes.map((r) => ({
          id: r.id,
          title: r.name,
          meta: levelName(r.level),
          group: r.craft,
          source: r.source,
          search: text(r.name, r.summary, skillName(rs, r.craft)),
        })),
      };
    }
    case 'performances':
      return {
        noun: ['performance', 'performances'],
        groups: LEVEL_GROUPS,
        entries: rs.performances.map((p) => ({
          id: p.id,
          title: p.name,
          meta: levelName(p.level),
          group: p.level,
          source: p.source,
          search: text(p.name, p.summary),
        })),
      };
    case 'starting-equipment':
      return {
        noun: ['item', 'items'],
        groups: [{ id: 'all', title: 'Starting items' }],
        entries: rs.startingEquipment.options.map((o) => ({
          id: o.id,
          title: o.name,
          ...(o.gmApproval ? { meta: 'GM approval' } : {}),
          group: 'all',
          source: rs.startingEquipment.source,
          search: text(o.name),
        })),
      };
    case 'artifact-powers':
      return {
        noun: ['power', 'powers'],
        groups: [1, 2, 3, 4, 5].map((t) => ({ id: String(t), title: `Tier ${t}` })),
        entries: rs.artifacts.powers.map((p) => ({
          id: p.id,
          title: p.name,
          meta: `Tier ${p.tier}`,
          group: String(p.tier),
          source: p.source,
          search: text(artifactPowerTitle(p.id), p.summary),
        })),
      };
    case 'familiar-tricks':
      return {
        noun: ['trick', 'tricks'],
        groups: [{ id: 'all', title: 'Special tricks' }],
        entries: rs.familiars.specialTricks.map((t) => ({
          id: t.id,
          title: t.name,
          group: 'all',
          source: t.source,
          search: text(familiarTrickTitle(t.id), t.summary),
        })),
      };
  }
}

/** Entries matching a search, in list order. */
export function filterEntries(entries: readonly RefEntry[], query: string): RefEntry[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...entries];
  const words = q.split(/\s+/);
  return entries.filter((e) => words.every((w) => e.search.includes(w)));
}
