// addJournal, tagJournal, removeJournal ([SKL-NOTES], [MAG-SPELLBOOK], [CRF-JOURNAL],
// [PERF-LEARN]).
// - Spells, recipes, and rituals the character cannot use yet are allowed, with a notice
//   (Q-MAG-3, Q-CRF-5). A performance note needs the Performance Technique for its level
//   (Q-SKL-9), except a starting pick.
// - Starting picks are Basic entries only (Q-ITEM-2).
import { z } from 'zod';
import { JournalKindSchema, JournalSourceSchema } from '../actions/journal.ts';
import { RefIdSchema } from '../actions/define.ts';
import { notice, ruleError } from '../errors.ts';
import { EventKeySchema, IdSchema } from '../model.ts';
import { journalRef, journalUsability } from '../rules/journal.ts';
import type { Sheet } from '../sheet.ts';
import { defineCommand, evaluation } from './define.ts';
import { OptionalShortText, OptionalText, ownedFromSheet } from './helpers.ts';

export const AddJournalCommand = z.object({
  type: z.literal('addJournal'),
  kind: JournalKindSchema,
  refId: RefIdSchema,
  source: JournalSourceSchema,
  /** Who copied or performed it (source `teacher`). */
  teacher: OptionalShortText,
  eventKey: EventKeySchema.optional(),
  note: OptionalText,
});
export type AddJournalCommand = z.input<typeof AddJournalCommand>;

/** The journal context of a sheet: owned skills (active ones), Calling blocks. */
export function journalContext(sheet: Sheet) {
  const owned = ownedFromSheet(sheet);
  const locked = new Set(sheet.skills.filter((s) => s.locked).map((s) => s.skillId));
  return {
    owned: (id: string) => (locked.has(id) ? { level: 0, techniques: [] } : owned(id)),
    spellbookBlocked: sheet.journals.spellbookCastingBlocked,
    blockedSchools: sheet.stats.other
      .filter((o) => o.stat === 'blockedMagicSchool' && typeof o.value === 'string')
      .map((o) => String(o.value)),
  };
}

export const addJournal = defineCommand<z.output<typeof AddJournalCommand>>({
  type: 'addJournal',
  schema: AddJournalCommand,
  evaluate(ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const RULE = 'SKL-NOTES';
    const ref = journalRef(ruleset, cmd.kind, cmd.refId);
    if (!ref) {
      ev.errors.push(
        ruleError('UNKNOWN_JOURNAL_ENTRY', `Unknown ${cmd.kind} "${cmd.refId}".`, RULE),
      );
      return ev;
    }
    const all = [
      ...sheet.journals.spellbook,
      ...sheet.journals.craftingJournal,
      ...sheet.journals.performanceRecord,
      ...sheet.journals.rituals,
    ];
    if (all.some((e) => e.kind === cmd.kind && e.refId === cmd.refId))
      ev.errors.push(ruleError('JOURNAL_DUPLICATE', `${ref.name} is already recorded.`, RULE));
    const teacher = cmd.teacher ?? '';
    if (cmd.source === 'teacher' && teacher === '')
      ev.errors.push(ruleError('TEACHER_REQUIRED', `Name who taught ${ref.name}.`, 'SKL-LOG'));
    if (cmd.source === 'starting' && ref.level !== 'basic')
      ev.errors.push(
        ruleError('STARTING_NOT_BASIC', 'Starting journal picks are Basic entries.', 'ITEM-START'),
      );
    const use = journalUsability(ruleset, cmd.kind, cmd.refId, journalContext(sheet));
    if (!use.usable) {
      if (cmd.kind === 'performance' && cmd.source !== 'starting')
        ev.errors.push(
          ruleError(
            'PERFORMANCE_TECHNIQUE_REQUIRED',
            `Learning ${ref.name}: ${use.reason ?? 'needs the Performance Technique.'}`,
            'PERF-LEARN',
          ),
        );
      else
        ev.notices.push(
          notice(
            'NOT_USABLE_YET',
            `${ref.name} is recorded but not usable yet: ${use.reason ?? ''}`.trim(),
            RULE,
          ),
        );
    }
    if (ev.errors.length > 0) return ev;
    const added = builder.add(
      'journal.added',
      {
        kind: cmd.kind,
        refId: cmd.refId,
        source: cmd.source,
        ...(teacher !== '' ? { teacher } : {}),
        status: 'pending',
      },
      { eventKey: cmd.eventKey, note: cmd.note },
    );
    // The build playground has no Logistics to tag it: it is tagged at once.
    if (builder.playground) builder.add('journal.tagged', { entryId: added.id });
    return ev;
  },
});

function findEntry(sheet: Sheet, entryId: string) {
  const j = sheet.journals;
  return [...j.spellbook, ...j.craftingJournal, ...j.performanceRecord, ...j.rituals].find(
    (e) => e.entryId === entryId,
  );
}

export const TagJournalCommand = z.object({
  type: z.literal('tagJournal'),
  entryId: IdSchema,
  note: OptionalText,
});
export type TagJournalCommand = z.input<typeof TagJournalCommand>;

export const tagJournal = defineCommand<z.output<typeof TagJournalCommand>>({
  type: 'tagJournal',
  schema: TagJournalCommand,
  evaluate(_ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    const entry = findEntry(sheet, cmd.entryId);
    if (!entry)
      ev.errors.push(ruleError('JOURNAL_NOT_FOUND', 'No such journal entry.', 'SKL-NOTES'));
    else if (entry.status === 'tagged')
      ev.errors.push(ruleError('ALREADY_TAGGED', `${entry.name} is already tagged.`, 'SKL-NOTES'));
    if (ev.errors.length > 0) return ev;
    builder.add('journal.tagged', { entryId: cmd.entryId }, { note: cmd.note });
    return ev;
  },
});

export const RemoveJournalCommand = z.object({
  type: z.literal('removeJournal'),
  entryId: IdSchema,
  reason: OptionalText,
  note: OptionalText,
});
export type RemoveJournalCommand = z.input<typeof RemoveJournalCommand>;

export const removeJournal = defineCommand<z.output<typeof RemoveJournalCommand>>({
  type: 'removeJournal',
  schema: RemoveJournalCommand,
  evaluate(_ruleset, sheet, cmd, builder) {
    const ev = evaluation();
    if (!findEntry(sheet, cmd.entryId))
      ev.errors.push(ruleError('JOURNAL_NOT_FOUND', 'No such journal entry.', 'SKL-NOTES'));
    const reason = cmd.reason ?? '';
    if (reason === '')
      ev.errors.push(
        ruleError('REASON_REQUIRED', 'Removing an entry needs a reason.', 'SKL-NOTES'),
      );
    if (ev.errors.length > 0) return ev;
    builder.add('journal.removed', { entryId: cmd.entryId, reason }, { note: cmd.note });
    return ev;
  },
});
