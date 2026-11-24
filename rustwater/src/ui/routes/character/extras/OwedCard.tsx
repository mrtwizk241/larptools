import { useId, useState, type FormEvent } from 'react';
import { Badge, Button, Card, Dialog, Field } from '../../../components/index.ts';
import { useCommand, type CommandApi } from '../../../data/engineHooks.ts';
import { ErrorList } from '../ErrorList.tsx';
import { eventLabel, eventsNewestFirst } from '../profession/events.ts';
import type { CharacterView } from '../view.ts';
import shared from '../character.module.css';
import styles from '../profession/profession.module.css';

/** Item rewards owed at check-in. Staff mark them delivered and add new ones. */
export function OwedCard({ view }: { view: CharacterView }) {
  const { sheet, isStaff } = view;
  const command = useCommand(view.id);
  const [adding, setAdding] = useState(false);
  const owed = [...sheet.owed].sort((a, b) => Number(a.delivered) - Number(b.delivered));
  return (
    <Card title="Owed rewards" className={shared.card ?? ''}>
      <div className={shared.stack}>
        {owed.length === 0 ? (
          <p>Nothing owed.</p>
        ) : (
          <ul className={styles.items}>
            {owed.map((item) => {
              const from = item.source === 'check-in' ? 'Check-in reward' : 'Added by staff';
              const at = eventLabel(sheet, item.eventKey);
              return (
                <li key={item.id} className={styles.item}>
                  <div className={styles.itemHead}>
                    <span className={styles.itemName}>{item.text}</span>
                    {item.delivered ? (
                      <Badge kind="approved">Delivered</Badge>
                    ) : (
                      <Badge kind="pending">Owed</Badge>
                    )}
                  </div>
                  <p className={shared.muted}>
                    {from}
                    {at ? `, ${at}` : ''}.
                    {item.delivered && item.deliveredAt
                      ? ` Delivered ${item.deliveredAt.slice(0, 10)}.`
                      : ''}
                  </p>
                  {isStaff && !item.delivered ? (
                    <div className={styles.actions}>
                      <Button
                        variant="secondary"
                        aria-label={`Mark delivered: ${item.text}`}
                        onClick={() =>
                          void command.run(
                            { type: 'deliverOwed', owedId: item.id },
                            { success: `Delivered: ${item.text}` },
                          )
                        }
                      >
                        Mark delivered
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {isStaff ? (
          <div className={styles.actions}>
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add an owed item
            </Button>
          </div>
        ) : null}
        <ErrorList messages={adding ? [] : command.errors.map((e) => e.message)} />
      </div>
      {adding ? (
        <AddOwedDialog
          view={view}
          command={command}
          onClose={() => {
            setAdding(false);
            command.clear();
          }}
        />
      ) : null}
    </Card>
  );
}

function AddOwedDialog({
  view,
  command,
  onClose,
}: {
  view: CharacterView;
  command: CommandApi;
  onClose: () => void;
}) {
  const formId = useId();
  const events = eventsNewestFirst(view.sheet);
  const [text, setText] = useState('');
  const [eventKey, setEventKey] = useState(events[0]?.key ?? '');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return setError('Enter what is owed.');
    setError('');
    const result = await command.run(
      { type: 'addOwed', text: value, ...(eventKey ? { eventKey } : {}) },
      { success: `Owed: ${value}` },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add an owed item"
      actions={
        <>
          <Button variant="primary" type="submit" form={formId}>
            Add owed item
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={shared.form} onSubmit={(e) => void submit(e)}>
        <Field label="What is owed" hint="For example 2 uncommon resources." required error={error}>
          {(control) => (
            <input
              {...control}
              autoComplete="off"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </Field>
        <Field label="Event" hint="The event it was earned at.">
          {(control) => (
            <select {...control} value={eventKey} onChange={(e) => setEventKey(e.target.value)}>
              <option value="">No event</option>
              {events.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.name} ({e.date})
                </option>
              ))}
            </select>
          )}
        </Field>
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}
