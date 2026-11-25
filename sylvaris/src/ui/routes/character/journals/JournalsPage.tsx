// `#/c/:id/journals` (nav label Magic): spellbook, crafting journal, performance record, and
// rituals. Everyone reads every entry; staff add entries, mark them tagged, and remove them.
import { useId, useState, type FormEvent } from 'react';
import { CircleCheck, CircleX } from 'lucide-react';
import type { JournalEntry, Ruleset, Sheet } from '../../../../engine/index.ts';
import {
  Badge,
  Button,
  Card,
  Dialog,
  Field,
  Tabs,
  type TabItem,
} from '../../../components/index.ts';
import { useCommand, type CommandApi } from '../../../data/engineHooks.ts';
import type { CharacterScreenProps } from '../screen.tsx';
import { ErrorList } from '../ErrorList.tsx';
import type { CharacterView } from '../view.ts';
import { AddEntryDialog } from './AddEntryDialog.tsx';
import { levelName } from './events.ts';
import {
  KINDS,
  canUseText,
  filterEntries,
  groupItems,
  metaText,
  refDetails,
  sourceText,
  statusText,
  summaryText,
  type KindInfo,
} from './journalModel.ts';
import shared from '../character.module.css';
import styles from './screens.module.css';

export function JournalsPage({ view }: CharacterScreenProps) {
  const tabs: TabItem[] = KINDS.map((info) => ({
    id: info.tab,
    label: info.label,
    content: <JournalTab view={view} info={info} />,
  }));
  return (
    <section aria-labelledby="magic-heading" className={shared.section}>
      <h2 id="magic-heading">Magic</h2>
      <Tabs label="Journals" tabs={tabs} />
    </section>
  );
}

function JournalTab({ view, info }: { view: CharacterView; info: KindInfo }) {
  const { ruleset, sheet, isStaff } = view;
  const command = useCommand(view.id);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<JournalEntry | null>(null);
  const all = info.entries(sheet);
  const shown = filterEntries(ruleset, info.kind, all, query);
  const groups = groupItems(ruleset, info.kind, shown);

  async function tag(entry: JournalEntry) {
    await command.run(
      { type: 'tagJournal', entryId: entry.entryId },
      { success: `${entry.name} is tagged.` },
    );
  }

  return (
    <div className={styles.tab}>
      {info.kind === 'spell' ? <SpellNotes sheet={sheet} /> : null}
      <div className={styles.toolbar}>
        <Field label={`Search the ${info.label}`}>
          {(control) => (
            <input
              {...control}
              type="search"
              value={query}
              autoComplete="off"
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
        </Field>
        {isStaff ? (
          <Button
            variant="primary"
            onClick={() => {
              command.clear();
              setAdding(true);
            }}
          >
            {`Add a ${info.noun}`}
          </Button>
        ) : null}
      </div>
      <p className={styles.count} aria-live="polite">
        {all.length === 0
          ? `No ${info.noun}s recorded yet.`
          : shown.length === 0
            ? `Nothing matches "${query.trim()}".`
            : `${shown.length} of ${all.length}. ${summaryText(all)}`}
      </p>
      <ErrorList messages={adding || removing ? [] : command.errors.map((e) => e.message)} />
      {groups.map((group) => (
        <Card key={group.id} title={`${group.name} (${group.items.length})`} headingLevel={3}>
          <ul className={styles.items}>
            {group.items.map((entry) => (
              <EntryItem
                key={entry.entryId}
                ruleset={ruleset}
                sheet={sheet}
                entry={entry}
                onTag={isStaff && entry.status === 'pending' ? () => void tag(entry) : undefined}
                onRemove={
                  isStaff
                    ? () => {
                        command.clear();
                        setRemoving(entry);
                      }
                    : undefined
                }
              />
            ))}
          </ul>
        </Card>
      ))}
      {adding ? (
        <AddEntryDialog
          view={view}
          info={info}
          command={command}
          onClose={() => setAdding(false)}
        />
      ) : null}
      {removing ? (
        <RemoveEntryDialog entry={removing} command={command} onClose={() => setRemoving(null)} />
      ) : null}
    </div>
  );
}

/** Sorcerer: known spells, and the note that the spellbook cannot be cast from. */
function SpellNotes({ sheet }: { sheet: Sheet }) {
  const { knownSpells, spellbookCastingBlocked } = sheet.journals;
  if (knownSpells.length === 0 && !spellbookCastingBlocked) return null;
  return (
    <Card title="Known spells" headingLevel={3}>
      <div className={shared.stack}>
        {spellbookCastingBlocked ? (
          <p>The active Calling casts known spells, not spells from the spellbook.</p>
        ) : null}
        {knownSpells.length === 0 ? (
          <p className={shared.muted}>No known spells chosen yet.</p>
        ) : (
          <ul className={styles.bullets}>
            {knownSpells.map((s) => (
              <li key={s.spellId}>
                {s.name}, {levelName(s.level)}. {s.usableNow ? 'Can cast now.' : 'Cannot cast yet.'}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function EntryItem({
  ruleset,
  sheet,
  entry,
  onTag,
  onRemove,
}: {
  ruleset: Ruleset;
  sheet: Sheet;
  entry: JournalEntry;
  onTag?: (() => void) | undefined;
  onRemove?: (() => void) | undefined;
}) {
  const details = refDetails(ruleset, entry.kind, entry.refId);
  return (
    <li className={styles.item}>
      <div className={styles.itemHead}>
        <h4 className={styles.itemName}>{entry.name}</h4>
        <Badge kind={entry.status === 'tagged' ? 'approved' : 'pending'}>
          {statusText(entry.status)}
        </Badge>
      </div>
      <p className={styles.meta}>{details ? metaText(details) : `${levelName(entry.level)}.`}</p>
      {details ? <p className={shared.text}>{details.summary}</p> : null}
      <p className={styles.meta}>How gained: {sourceText(sheet, entry)}.</p>
      <p className={`${styles.status} ${entry.usableNow ? styles.ok : styles.blocked}`}>
        {entry.usableNow ? (
          <CircleCheck aria-hidden="true" className={styles.statusIcon} />
        ) : (
          <CircleX aria-hidden="true" className={styles.statusIcon} />
        )}
        <span>{canUseText(entry)}</span>
      </p>
      {onTag || onRemove ? (
        <div className={styles.actions}>
          {onTag ? (
            <Button variant="secondary" aria-label={`Mark tagged: ${entry.name}`} onClick={onTag}>
              Mark tagged
            </Button>
          ) : null}
          {onRemove ? (
            <Button variant="ghost" aria-label={`Remove: ${entry.name}`} onClick={onRemove}>
              Remove
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function RemoveEntryDialog({
  entry,
  command,
  onClose,
}: {
  entry: JournalEntry;
  command: CommandApi;
  onClose: () => void;
}) {
  const formId = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (command.running) return;
    const text = reason.trim();
    if (!text) return setError('Give a reason.');
    setError('');
    const result = await command.run(
      { type: 'removeJournal', entryId: entry.entryId, reason: text },
      { success: `Removed ${entry.name}.` },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={() => {
        command.clear();
        onClose();
      }}
      title={`Remove ${entry.name}?`}
      actions={
        <>
          <Button variant="danger" type="submit" form={formId}>
            Remove
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              command.clear();
              onClose();
            }}
          >
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={shared.form} onSubmit={(e) => void submit(e)}>
        <p>The entry leaves the journal. The log keeps the reason.</p>
        <Field label="Reason" required error={error}>
          {(control) => (
            <input
              {...control}
              value={reason}
              maxLength={2000}
              autoComplete="off"
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}
