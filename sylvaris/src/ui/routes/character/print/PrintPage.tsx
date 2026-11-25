// `#/c/:id/print`: paper preview of the character sheet and a check-in receipt, with a Print
// button. `?show=receipt&event=<key>` opens the receipt for one event (latest by default).
import { useId, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { Printer } from 'lucide-react';
import { Button, Card, Field, Tabs } from '../../../components/index.ts';
import { dateText } from '../../../lib/names.ts';
import type { CharacterScreenProps } from '../screen.tsx';
import type { CharacterView } from '../view.ts';
import { CheckInReceipt } from './CheckInReceipt.tsx';
import { PrintSheet } from './PrintSheet.tsx';
import { buildReceipt, receiptEvents } from './receipt.ts';
import styles from './print.module.css';

type PrintTab = 'sheet' | 'receipt';

export function PrintPage({ view }: CharacterScreenProps) {
  const [params, setParams] = useSearchParams();
  const tab: PrintTab = params.get('show') === 'receipt' ? 'receipt' : 'sheet';
  // One time for both views, so the preview and the paper agree.
  const printedAt = useMemo(() => new Date(), []);

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) next.set(key, value);
    setParams(next, { replace: true });
  };

  return (
    <section aria-labelledby="print-heading" className={styles.section}>
      <div className={styles.controls} data-print-hide="">
        <h2 id="print-heading">Print</h2>
        <Button
          variant="primary"
          icon={<Printer aria-hidden="true" />}
          onClick={() => window.print()}
        >
          Print
        </Button>
      </div>
      <p className={styles.hint} data-print-hide="">
        The preview below is what prints, on US Letter paper.
      </p>
      <Tabs
        label="What to print"
        selectedId={tab}
        onSelect={(id) => update({ show: id })}
        tabs={[
          {
            id: 'sheet',
            label: 'Character sheet',
            content: <PrintSheet view={view} printedAt={printedAt} />,
          },
          {
            id: 'receipt',
            label: 'Check-in receipt',
            content: (
              <ReceiptTab
                view={view}
                printedAt={printedAt}
                eventKey={params.get('event')}
                onEvent={(key) => update({ event: key })}
              />
            ),
          },
        ]}
      />
    </section>
  );
}

function ReceiptTab({
  view,
  printedAt,
  eventKey,
  onEvent,
}: {
  view: CharacterView;
  printedAt: Date;
  eventKey: string | null;
  onEvent: (key: string) => void;
}) {
  const selectId = useId();
  const events = receiptEvents(view.sheet);
  const selected = events.find((e) => e.key === eventKey)?.key ?? events[0]?.key;
  if (selected === undefined)
    return (
      <Card className={styles.empty ?? ''}>
        <p>No check-ins yet. Check the character in to an event to print a receipt.</p>
      </Card>
    );
  const receipt = buildReceipt(view.ruleset, view.sheet, selected);
  return (
    <div className={styles.receiptTab}>
      <div data-print-hide="" className={styles.picker}>
        <Field label="Event" id={selectId}>
          {(control) => (
            <select {...control} value={selected} onChange={(e) => onEvent(e.target.value)}>
              {events.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.name}, {dateText(e.date)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      {receipt ? <CheckInReceipt view={view} receipt={receipt} printedAt={printedAt} /> : null}
    </div>
  );
}
