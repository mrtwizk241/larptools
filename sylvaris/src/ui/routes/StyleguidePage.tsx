import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { BookOpen, Ellipsis, Plus, ScrollText, Settings, Sparkles, Swords } from 'lucide-react';
import {
  AppShell,
  Badge,
  Button,
  Card,
  CharacterNav,
  ConfirmDialog,
  Dialog,
  Field,
  IconButton,
  LevelStepper,
  PointsChip,
  SectionHeading,
  Tabs,
  useToast,
  type CharacterNavItem,
} from '../components/index.ts';
import { pageTitle, useDocumentTitle } from '../lib/routeFocus.ts';
import { useTheme, type ThemeChoice } from '../theme.ts';
import styles from './StyleguidePage.module.css';

// The character nav's labels and icons (CharacterLayout), for design QA. The e2e test checks the
// labels fit a 375px bottom bar. Every item stays on the style guide.
const NAV_ITEMS: CharacterNavItem[] = [
  { icon: ScrollText, label: 'Sheet', route: '/styleguide' },
  { icon: Swords, label: 'Skills', route: '/styleguide/skills' },
  { icon: BookOpen, label: 'Magic', route: '/styleguide/magic' },
  { icon: Sparkles, label: 'Play', route: '/styleguide/play' },
  { icon: Ellipsis, label: 'More', route: '/styleguide/more' },
];

const LEVEL_COSTS = [10, 20, 30, 40, 50];

/** Every component and state on one page, for design QA (`#/styleguide`). */
export function StyleguidePage() {
  useDocumentTitle(pageTitle('Style guide'));
  return (
    <AppShell modeBadge={<Badge kind="staff" />} nav={<CharacterNav items={NAV_ITEMS} />}>
      <div className={styles.page}>
        <h1>Style guide</h1>
        <div className={styles.grid}>
          <ThemeCard />
          <TypeCard />
          <ButtonsCard />
          <BadgesCard />
          <PointsCard />
          <StepperCard />
          <FieldsCard />
          <TabsCard />
          <DialogsCard />
          <ToastCard />
        </div>
      </div>
    </AppShell>
  );
}

function ThemeCard() {
  const { theme, setTheme } = useTheme();
  return (
    <Card title="Theme">
      <Field label="Theme" hint="System follows the device setting.">
        {(control) => (
          <select
            {...control}
            value={theme}
            onChange={(event) => setTheme(event.target.value as ThemeChoice)}
          >
            <option value="system">System</option>
            <option value="light">Vellum (light)</option>
            <option value="dark">Nightfall (dark)</option>
          </select>
        )}
      </Field>
    </Card>
  );
}

function TypeCard() {
  return (
    <Card title="Type">
      <div className={styles.stack}>
        <p className={styles.characterName}>Mira Saltmarsh</p>
        <SectionHeading level={3}>Section heading</SectionHeading>
        <p>Body text is Rubik at 17px. Every form must read on a phone in sunlight and at night.</p>
        <p className={styles.mono}>
          CXP <span className="num">145</span> / <span className="num">200</span>
        </p>
        <p className={styles.wordmark}>Sylvaris</p>
        <small className={styles.caption}>Caption text, 14px, captions and footer only.</small>
        <Link to="/styleguide" className={styles.link}>
          A standalone link
        </Link>
      </div>
    </Card>
  );
}

function ButtonsCard() {
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <Card title="Buttons">
      <div className={styles.stack}>
        <div className={styles.row}>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
        <div className={styles.row}>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            Delete character
          </Button>
          <Button variant="secondary" icon={<Plus />}>
            Add skill
          </Button>
        </div>
        <Button variant="primary" disabled disabledReason="Needs Assault level 9">
          Learn Cleave
        </Button>
        <div className={styles.row}>
          <IconButton aria-label="Settings" icon={<Settings />} />
          <IconButton aria-label="Add item" variant="ghost" icon={<Plus />} />
        </div>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Delete character?"
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          toast.show('Character deleted.', { onUndo: () => toast.show('Character restored.') });
        }}
      >
        <p>Mira Saltmarsh and her history will be removed from this device.</p>
      </ConfirmDialog>
    </Card>
  );
}

function BadgesCard() {
  return (
    <Card title="Badges">
      <div className={styles.row}>
        <Badge kind="staff" />
        <Badge kind="player" />
        <Badge kind="pending" />
        <Badge kind="approved" />
        <Badge kind="rejected" />
      </div>
    </Card>
  );
}

function PointsCard() {
  return (
    <Card title="Points chips">
      <div className={styles.row}>
        <PointsChip label="CXP" value={45} suffix="left" />
        <PointsChip label="Body" value={12} />
        <PointsChip label="CXP" value={-5} suffix="left" warning="Over budget" />
      </div>
    </Card>
  );
}

function StepperCard() {
  const [level, setLevel] = useState(2);
  const nextCost = LEVEL_COSTS[level];
  return (
    <Card title="Level stepper">
      <div className={styles.stack}>
        <StepperRow label="Assault (staff)">
          <LevelStepper
            label="Assault"
            value={level}
            min={0}
            max={LEVEL_COSTS.length}
            onChange={setLevel}
            {...(nextCost !== undefined ? { nextCostLabel: `Next level: ${nextCost} CXP` } : {})}
          />
        </StepperRow>
        <StepperRow label="Defense (blocked)">
          <LevelStepper
            label="Defense"
            value={3}
            min={0}
            max={5}
            onChange={() => undefined}
            blockedReason="Needs 40 CXP, 25 left"
          />
        </StepperRow>
        <StepperRow label="Lore (at max)">
          <LevelStepper label="Lore" value={5} min={0} max={5} onChange={() => undefined} />
        </StepperRow>
        <StepperRow label="Craft (player view)">
          <LevelStepper
            label="Craft"
            value={3}
            min={0}
            max={5}
            onChange={() => undefined}
            readOnly
          />
        </StepperRow>
      </div>
    </Card>
  );
}

function StepperRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.stepperRow}>
      <span className={styles.stepperLabel}>{label}</span>
      {children}
    </div>
  );
}

function FieldsCard() {
  const [name, setName] = useState('Mira Saltmarsh');
  const [handle, setHandle] = useState('');
  return (
    <Card title="Fields">
      <form className={styles.stack} onSubmit={(event) => event.preventDefault()}>
        <Field label="Character name" hint="As staff will see it.">
          {(control) => (
            <input
              {...control}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Field label="Player handle" error="Enter a player handle." required>
          {(control) => (
            <input
              {...control}
              type="text"
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
            />
          )}
        </Field>
        <Field label="Lineage">
          {(control) => (
            <select {...control} defaultValue="human">
              <option value="human">Human</option>
              <option value="mutant">Mutant</option>
            </select>
          )}
        </Field>
        <Field label="Notes" hint="Private to this device.">
          {(control) => <textarea {...control} rows={3} />}
        </Field>
      </form>
    </Card>
  );
}

function TabsCard() {
  return (
    <Card title="Tabs">
      <Tabs
        label="Character sections"
        tabs={[
          { id: 'overview', label: 'Overview', content: <p>Overview panel.</p> },
          { id: 'skills', label: 'Skills', content: <p>Skills panel.</p> },
          { id: 'gear', label: 'Gear', content: <p>Gear panel.</p> },
          { id: 'history', label: 'History', content: <p>History panel.</p> },
        ]}
      />
    </Card>
  );
}

function DialogsCard() {
  const [open, setOpen] = useState(false);
  return (
    <Card title="Dialog">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open dialog
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="About this sheet"
        actions={
          <Button variant="primary" onClick={() => setOpen(false)}>
            Close
          </Button>
        }
      >
        <p>Escape closes the dialog and focus returns to the button that opened it.</p>
      </Dialog>
    </Card>
  );
}

function ToastCard() {
  const toast = useToast();
  return (
    <Card title="Toast">
      <div className={styles.row}>
        <Button variant="secondary" onClick={() => toast.show('Saved.')}>
          Show toast
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast.show('Skill removed.', { onUndo: () => toast.show('Skill restored.') })
          }
        >
          Toast with Undo
        </Button>
      </div>
    </Card>
  );
}
