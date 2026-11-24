import { useId, useState, type FormEvent } from 'react';
import { Pencil } from 'lucide-react';
import { Button, Card, Dialog, Field } from '../../components/index.ts';
import { useCommand } from '../../data/engineHooks.ts';
import {
  MAX_AGE,
  MIN_AGE,
  parseAge,
  PROFILE_AGE_HELP,
  profileFieldErrors,
  type ProfileErrors,
  type ProfileFields,
} from '../create/validation.ts';
import { ErrorList } from './ErrorList.tsx';
import { ancestryLine } from './format.ts';
import type { CharacterView } from './view.ts';
import styles from './character.module.css';

/** Profile: player, email, character, ancestry, age step, effects. Staff edit them in a dialog. */
export function ProfileCard({ view }: { view: CharacterView }) {
  const { profile, ancestry } = view.sheet;
  const [editing, setEditing] = useState(false);
  return (
    <Card title="Profile" className={styles.card ?? ''}>
      <dl className={styles.facts}>
        <div>
          <dt>Player</dt>
          <dd>{profile.playerName}</dd>
        </div>
        {profile.playerEmail ? (
          <div>
            <dt>Email</dt>
            <dd className={styles.wrap}>{profile.playerEmail}</dd>
          </div>
        ) : null}
        <div>
          <dt>Character</dt>
          <dd>{profile.characterName}</dd>
        </div>
        {ancestry ? (
          <div>
            <dt>Ancestry</dt>
            <dd>{ancestryLine(ancestry.ancestryName, ancestry.subtypeName)}</dd>
          </div>
        ) : null}
        {profile.age !== null ? (
          <div>
            <dt>Age</dt>
            <dd>
              <span className="num">{profile.age}</span> of <span className="num">{MAX_AGE}</span>
              <span className={styles.from}>Each step is 10% of a full life.</span>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Effects</dt>
          <dd className={styles.text}>{profile.effects || 'None'}</dd>
        </div>
      </dl>
      {view.isStaff ? (
        <div className={styles.cardActions}>
          <Button variant="ghost" icon={<Pencil />} onClick={() => setEditing(true)}>
            Edit profile
          </Button>
        </div>
      ) : null}
      {editing ? <ProfileDialog view={view} onClose={() => setEditing(false)} /> : null}
    </Card>
  );
}

function ProfileDialog({ view, onClose }: { view: CharacterView; onClose: () => void }) {
  const { profile } = view.sheet;
  const formId = useId();
  const command = useCommand(view.id);
  const [fields, setFields] = useState<ProfileFields>({
    characterName: profile.characterName,
    playerName: profile.playerName,
    playerEmail: profile.playerEmail ?? '',
    age: profile.age === null ? '' : String(profile.age),
  });
  const [effects, setEffects] = useState(profile.effects);
  const [errors, setErrors] = useState<ProfileErrors>({});

  const set = (key: keyof ProfileFields) => (value: string) =>
    setFields((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = profileFieldErrors(fields);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const result = await command.run(
      {
        type: 'updateProfile',
        characterName: fields.characterName.trim(),
        playerName: fields.playerName.trim(),
        playerEmail: fields.playerEmail.trim(),
        age: parseAge(fields.age) ?? null,
        effects,
      },
      { success: 'Profile saved.' },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit profile"
      actions={
        <>
          <Button variant="primary" type="submit" form={formId}>
            Save profile
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={styles.form} onSubmit={(e) => void submit(e)}>
        <Field label="Character name" required error={errors.characterName}>
          {(control) => (
            <input
              {...control}
              autoComplete="off"
              value={fields.characterName}
              onChange={(e) => set('characterName')(e.target.value)}
            />
          )}
        </Field>
        <Field label="Player name" required error={errors.playerName}>
          {(control) => (
            <input
              {...control}
              autoComplete="off"
              value={fields.playerName}
              onChange={(e) => set('playerName')(e.target.value)}
            />
          )}
        </Field>
        <Field label="Player email" hint="Optional." error={errors.playerEmail}>
          {(control) => (
            <input
              {...control}
              type="email"
              autoComplete="off"
              value={fields.playerEmail}
              onChange={(e) => set('playerEmail')(e.target.value)}
            />
          )}
        </Field>
        <Field label="Age" hint={PROFILE_AGE_HELP} error={errors.age}>
          {(control) => (
            <input
              {...control}
              type="number"
              min={MIN_AGE}
              max={MAX_AGE}
              step={1}
              inputMode="numeric"
              autoComplete="off"
              value={fields.age}
              onChange={(e) => set('age')(e.target.value)}
            />
          )}
        </Field>
        <Field label="Effects" hint="Character or infection effects.">
          {(control) => (
            <textarea {...control} value={effects} onChange={(e) => setEffects(e.target.value)} />
          )}
        </Field>
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}
