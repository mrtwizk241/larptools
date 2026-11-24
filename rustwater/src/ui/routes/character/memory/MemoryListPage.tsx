// `#/c/:id/spells` and `#/c/:id/recipes`: every spell (performance, ritual) or recipe in the rules,
// like the Skills screen: filter chips, search, Memorized only, and rows that open in place with
// the rule text. Players tap + to tell staff they learned one; staff memorize and forget.
import { useId, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Check, Plus, TriangleAlert } from 'lucide-react';
import { preview } from '../../../../engine/index.ts';
import type { MemorizedEntry, MemorySlotPool } from '../../../../engine/index.ts';
import type { Request } from '../../../../engine/model.ts';
import {
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  Field,
  IconButton,
  ScrollRow,
  Tabs,
  useToast,
  type TabItem,
} from '../../../components/index.ts';
import { useCommand } from '../../../data/engineHooks.ts';
import { useRepository } from '../../../data/hooks.ts';
import { newRequest } from '../../../data/requests.ts';
import { ErrorList } from '../ErrorList.tsx';
import { ExpandItem } from '../ExpandItem.tsx';
import { canRequest } from '../skills/requestParts.ts';
import { costText } from '../skills/skillInfo.ts';
import type { CharacterView } from '../view.ts';
import { MemorizeDialog } from './MemorizeDialog.tsx';
import { filterGroups, filterRows, memoryRows, type MemoryRow } from './memoryList.ts';
import {
  PLURAL,
  hasAccess,
  poolBreakdown,
  poolSummary,
  ruleDetails,
  slotLabel,
  unlockText,
  visiblePools,
  type SlotKind,
} from './model.ts';
import characterStyles from '../character.module.css';
import expand from '../expand.module.css';
import skillStyles from '../skills/skills.module.css';
import styles from './memory.module.css';

const SINGULAR: Record<SlotKind, string> = {
  spell: 'spell',
  recipe: 'recipe',
  performance: 'performance',
  ritual: 'ritual',
};

/** `#/c/:id/spells`: spells, performances, and rituals. */
export function SpellsPage({ view }: { view: CharacterView }) {
  return (
    <MemoryScreen
      view={view}
      heading="Spells"
      tabs={[
        { id: 'spells', label: 'Spells', kind: 'spell' },
        { id: 'performances', label: 'Performances', kind: 'performance' },
        { id: 'rituals', label: 'Rituals', kind: 'ritual' },
      ]}
    />
  );
}

/** `#/c/:id/recipes`: recipes. */
export function RecipesPage({ view }: { view: CharacterView }) {
  return (
    <MemoryScreen
      view={view}
      heading="Recipes"
      tabs={[{ id: 'recipes', label: 'Recipes', kind: 'recipe' }]}
    />
  );
}

function MemoryScreen({
  view,
  heading,
  tabs,
}: {
  view: CharacterView;
  heading: string;
  tabs: { id: string; label: string; kind: SlotKind }[];
}) {
  const [params, setParams] = useSearchParams();
  const first = tabs[0]?.id ?? '';
  const tab = tabs.some((t) => t.id === params.get('tab')) ? (params.get('tab') ?? first) : first;
  const headingId = useId();
  const items: TabItem[] = tabs.map(({ id, label, kind }) => ({
    id,
    label,
    content: id !== tab ? null : <MemoryList view={view} kind={kind} />,
  }));
  return (
    <section aria-labelledby={headingId} className={characterStyles.section}>
      <h2 id={headingId}>{heading}</h2>
      {tabs.length > 1 ? (
        <Tabs
          label={heading}
          selectedId={tab}
          onSelect={(id) =>
            setParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                next.set('tab', id);
                return next;
              },
              { replace: true },
            )
          }
          tabs={items}
        />
      ) : (
        items[0]?.content
      )}
    </section>
  );
}

function MemoryList({ view, kind }: { view: CharacterView; kind: SlotKind }) {
  const { ruleset, sheet, isStaff } = view;
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<string[]>([]);
  const [ownedOnly, setOwnedOnly] = useState(!isStaff);
  const [requesting, setRequesting] = useState<MemoryRow | null>(null);
  const [memorizing, setMemorizing] = useState<string | null>(null);
  const [forgetting, setForgetting] = useState<MemorizedEntry | null>(null);
  const command = useCommand(view.id);
  const plural = PLURAL[kind];
  const unlocked = hasAccess(ruleset, sheet, kind);
  const pools = visiblePools(sheet, kind, unlocked);
  const chips = filterGroups(ruleset, kind);
  const rows = filterRows(memoryRows(ruleset, sheet, kind), { groups, query, ownedOnly });
  const asker = canRequest(view);

  async function forget(entry: MemorizedEntry) {
    setForgetting(null);
    await command.run(
      { type: 'forgetMemorized', entryId: entry.actionId },
      { success: `Forgot ${entry.name}.` },
    );
  }

  return (
    <div className={`${skillStyles.tabBody} ${skillStyles.listBody}`}>
      {unlocked ? null : <p className={styles.unlock}>{unlockText(ruleset, kind)}</p>}
      {pools.length > 0 ? (
        <Card
          title={`${SINGULAR[kind][0]?.toUpperCase() ?? ''}${SINGULAR[kind].slice(1)} slots`}
          headingLevel={3}
        >
          <ul className={styles.pools}>
            {pools.map((pool) => (
              <li key={pool.pool}>
                <PoolRow view={view} pool={pool} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {chips.length > 0 ? (
        <ScrollRow as="div" group label={`Filter ${plural}`} wrapOnDesktop>
          {chips.map((chip) => {
            const pressed = groups.includes(chip.id);
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={pressed}
                className={skillStyles.filterChip}
                onClick={() =>
                  setGroups(pressed ? groups.filter((g) => g !== chip.id) : [...groups, chip.id])
                }
              >
                {pressed ? <Check aria-hidden="true" className={skillStyles.filterIcon} /> : null}
                {chip.label}
              </button>
            );
          })}
        </ScrollRow>
      ) : null}
      <div className={skillStyles.searchRow}>
        <Field label={`Search ${plural}`} className={skillStyles.search ?? ''}>
          {(control) => (
            <input
              {...control}
              type="search"
              autoComplete="off"
              placeholder="Name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
        </Field>
        <label className={skillStyles.check}>
          <input
            type="checkbox"
            checked={ownedOnly}
            onChange={(e) => setOwnedOnly(e.target.checked)}
          />
          <span>Memorized only</span>
        </label>
      </div>
      <p className={skillStyles.count} aria-live="polite">
        {rows.length === 1 ? `1 ${SINGULAR[kind]}` : `${rows.length} ${plural}`}
      </p>
      {asker ? (
        <p className={skillStyles.hint}>
          {`Learned ${kind === 'ritual' ? 'a ritual' : `a ${SINGULAR[kind]}`} in game? Tap + next to it and say who taught you. To find one you do not have, turn off Memorized only.`}
        </p>
      ) : null}
      <ErrorList messages={command.errors.map((e) => e.message)} />
      {rows.length > 0 ? (
        <ul className={expand.list}>
          {rows.map((row) => {
            const entry = sheet.memory.entries.find(
              (e) => e.kind === kind && e.refId === row.refId,
            );
            return (
              <li key={row.refId}>
                <ExpandItem
                  title={row.name}
                  meta={
                    <>
                      <span>{row.detail}</span>
                      <span>{row.memorized ? 'Memorized' : 'Not memorized'}</span>
                    </>
                  }
                  action={
                    asker && !row.memorized && row.notMemorizable === null ? (
                      <IconButton
                        className={skillStyles.addButton}
                        aria-label={`I learned ${row.name}`}
                        icon={<Plus />}
                        onClick={() => setRequesting(row)}
                      />
                    ) : undefined
                  }
                >
                  {() => (
                    <MemoryPanel
                      view={view}
                      kind={kind}
                      row={row}
                      entry={entry}
                      onMemorize={() => {
                        command.clear();
                        setMemorizing(row.refId);
                      }}
                      onForget={entry ? () => setForgetting(entry) : undefined}
                    />
                  )}
                </ExpandItem>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>
          {ownedOnly && query.trim() === '' && groups.length === 0
            ? `No ${plural} memorized yet.`
            : `No ${plural} match.`}
        </p>
      )}
      {requesting ? (
        <RequestMemoryDialog
          view={view}
          kind={kind}
          row={requesting}
          onClose={() => setRequesting(null)}
        />
      ) : null}
      {memorizing ? (
        <MemorizeDialog
          view={view}
          kind={kind}
          initialRefId={memorizing}
          onClose={() => setMemorizing(null)}
        />
      ) : null}
      <ConfirmDialog
        open={forgetting !== null}
        title={`Forget ${forgetting?.name ?? ''}?`}
        confirmLabel="Forget"
        danger
        onConfirm={() => {
          if (forgetting) void forget(forgetting);
        }}
        onCancel={() => setForgetting(null)}
      >
        <p>
          {forgetting ? `This frees its ${slotLabel(sheet, forgetting)}. ` : ''}
          No AP is refunded: memorization levels already bought stay bought.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function MemoryPanel({
  view,
  kind,
  row,
  entry,
  onMemorize,
  onForget,
}: {
  view: CharacterView;
  kind: SlotKind;
  row: MemoryRow;
  entry: MemorizedEntry | undefined;
  onMemorize: () => void;
  onForget: (() => void) | undefined;
}) {
  const details = ruleDetails(view.ruleset, kind, row.refId);
  const auto =
    kind === 'ritual' && view.sheet.memory.autoLearned.some((a) => a.refId === row.refId);
  return (
    <>
      <p className={expand.muted}>
        {entry
          ? `Memorized. ${slotLabel(view.sheet, entry)}.`
          : auto
            ? 'Known automatically. Uses no slot.'
            : row.notMemorizable
              ? row.notMemorizable
              : row.unmet.length > 0
                ? `To memorize it you need ${row.unmet.join(', ')}.`
                : 'Not memorized yet.'}
      </p>
      {details?.facts.map((fact) => (
        <p key={fact}>{fact}</p>
      ))}
      {details ? <p className={expand.text}>{details.text}</p> : null}
      {view.isStaff ? (
        <div className={styles.actions}>
          {entry && onForget ? (
            <Button variant="ghost" aria-label={`Forget ${row.name}`} onClick={onForget}>
              Forget
            </Button>
          ) : !auto && row.notMemorizable === null && row.unmet.length === 0 ? (
            <Button variant="primary" aria-label={`Memorize ${row.name}`} onClick={onMemorize}>
              Memorize
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** Player: "I learned Fire Bolt", with the teacher and a note, sent to staff. */
function RequestMemoryDialog({
  view,
  kind,
  row,
  onClose,
}: {
  view: CharacterView;
  kind: SlotKind;
  row: MemoryRow;
  onClose: () => void;
}) {
  const formId = useId();
  const repository = useRepository();
  const toast = useToast();
  const [teacher, setTeacher] = useState('');
  const [note, setNote] = useState('');
  const [teacherError, setTeacherError] = useState<string | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const draft: Request = {
    id: 'draft',
    characterId: view.id,
    createdAt: new Date(0).toISOString(),
    kind: 'memorize',
    memoryKind: kind,
    refId: row.refId,
    teacher,
    note: '',
    status: 'draft',
  };
  const check = preview(view.ruleset, view.sheet, { type: 'approveRequest', request: draft });
  const teacherRequired = check.teacherRequired === true;
  const reasons = [...new Set(check.errors.map((e) => e.message))];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (teacherRequired && teacher.trim() === '') {
      setTeacherError("Enter the teacher's name.");
      return;
    }
    setTeacherError(undefined);
    setSaving(true);
    try {
      await repository.saveRequest(
        newRequest({
          kind: 'memorize',
          characterId: view.id,
          memoryKind: kind,
          refId: row.refId,
          teacher,
          note,
        }),
      );
      toast.show(`Sent ${row.name} to staff. Their answer shows under My learning requests.`);
      onClose();
    } catch (error) {
      setSaveError(
        `The request could not be sent: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`I learned ${row.name}`}
      actions={
        <>
          <Button variant="primary" type="submit" form={formId}>
            Send to staff
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className={characterStyles.form}
        onSubmit={(e) => void submit(e)}
      >
        <p>Tell staff who taught you. They approve it and it goes on your sheet.</p>
        <Field
          label="Who taught you?"
          hint={
            teacherRequired
              ? 'Required: memorizing this needs a new memorization level, which needs a teacher.'
              : 'Optional: leave blank when you learned it from notes or a blueprint.'
          }
          required={teacherRequired}
          error={teacherError}
        >
          {(control) => (
            <input
              {...control}
              autoComplete="off"
              maxLength={200}
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
            />
          )}
        </Field>
        <Field label="Note" hint="Optional: anything staff should know.">
          {(control) => (
            <textarea
              {...control}
              maxLength={5000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>
        {check.cost ? (
          <p>
            If approved:{' '}
            {check.cost.amount > 0
              ? `${costText(view.ruleset, check.cost)} for one more memorization level.`
              : 'it uses a free slot.'}
          </p>
        ) : null}
        {reasons.length > 0 ? (
          <div className={characterStyles.stack}>
            <p className={characterStyles.lead}>Staff may not be able to approve this yet:</p>
            <ul className={characterStyles.warningList}>
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {saveError ? <p role="alert">{saveError}</p> : null}
      </form>
    </Dialog>
  );
}

/** One slot pool, "Life: 2 of 3 used", opening to where its slots come from. */
function PoolRow({ view, pool }: { view: CharacterView; pool: MemorySlotPool }) {
  const lines = poolBreakdown(view.ruleset, pool);
  return (
    <details className={styles.expander}>
      <summary>
        <span className={styles.poolLine}>
          {poolSummary(pool)}
          {pool.free < 0 ? (
            <>
              {' '}
              <span className={styles.over}>
                <TriangleAlert aria-hidden="true" className={styles.overIcon} />
                {`Over by ${-pool.free}`}
              </span>
            </>
          ) : null}
        </span>
      </summary>
      <div className={styles.expanderBody}>
        {lines.length === 0 ? (
          <p className={characterStyles.muted}>No slots yet.</p>
        ) : (
          <ul className={styles.breakdown}>
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
