// Profile: names, concept, age category, backstory, and notes. Staff edit them, and the race
// choices, in a dialog.
import { useId, useState, type FormEvent } from 'react';
import { Pencil } from 'lucide-react';
import type { UpdateProfileCommand } from '../../../../engine/index.ts';
import { Button, Card, Dialog, Field } from '../../../components/index.ts';
import { useCommand } from '../../../data/engineHooks.ts';
import { choiceOptionLabel, languageName } from '../../create/steps.ts';
import { ErrorList } from '../ErrorList.tsx';
import type { CharacterView } from '../view.ts';
import styles from '../character.module.css';
export function ProfileCard({ view }: { view: CharacterView }) {
  const { profile, calling } = view.sheet;
  const [editing, setEditing] = useState(false);
  return (
    <Card title="Profile" className={styles.card ?? ''}>
      <dl className={styles.facts}>
        <div>
          <dt>Character</dt>
          <dd>{profile.characterName}</dd>
        </div>
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
        {profile.concept ? (
          <div>
            <dt>Concept</dt>
            <dd className={styles.text}>{profile.concept}</dd>
          </div>
        ) : null}
        <div>
          <dt>Age category</dt>
          <dd className="num">
            {profile.ageCategory}
            {profile.ageYears !== null ? `, ${profile.ageYears} years` : ''}
          </dd>
        </div>
        {calling ? (
          <div>
            <dt>Calling</dt>
            <dd>{calling.name}</dd>
          </div>
        ) : null}
        <div>
          <dt>Events attended</dt>
          <dd className="num">{view.sheet.fullEvents}</dd>
        </div>
        <div>
          <dt>Backstory</dt>
          <dd className={styles.text}>{profile.backstory || 'None yet'}</dd>
        </div>
        <div>
          <dt>Notes</dt>
          <dd className={styles.text}>{profile.notes || 'None'}</dd>
        </div>
      </dl>
      {view.isStaff ? (
        <div className={styles.cardActions}>
          <Button variant="secondary" icon={<Pencil />} onClick={() => setEditing(true)}>
            Edit profile
          </Button>
        </div>
      ) : null}
      {editing ? <ProfileDialog view={view} onClose={() => setEditing(false)} /> : null}
    </Card>
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Fields {
  characterName: string;
  playerName: string;
  playerEmail: string;
  concept: string;
  backstory: string;
  notes: string;
  ageCategory: number;
  literacy: 'race-language' | 'common';
  choices: Record<string, string>;
}

function ProfileDialog({ view, onClose }: { view: CharacterView; onClose: () => void }) {
  const { profile, race } = view.sheet;
  const { ruleset } = view;
  const raceDef = race ? ruleset.racesById[race.raceId] : undefined;
  const formId = useId();
  const command = useCommand(view.id);
  const initialChoices: Record<string, string> = {};
  for (const [k, v] of Object.entries(race?.choices ?? {}))
    if (typeof v === 'string') initialChoices[k] = v;
  const [fields, setFields] = useState<Fields>({
    characterName: profile.characterName,
    playerName: profile.playerName,
    playerEmail: profile.playerEmail ?? '',
    concept: profile.concept,
    backstory: profile.backstory,
    notes: profile.notes,
    ageCategory: profile.ageCategory,
    literacy: race?.literacy ?? 'race-language',
    choices: initialChoices,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({});
  const { minAgeCategory, maxAgeCategory } = ruleset.ruleset.creation;

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  const setChoice = (id: string, value: string) =>
    setFields((current) => {
      const choices = { ...current.choices };
      if (value.trim() === '') delete choices[id];
      else choices[id] = value;
      return { ...current, choices };
    });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: Partial<Record<keyof Fields, string>> = {};
    if (fields.characterName.trim() === '') found.characterName = 'Enter the character name.';
    if (fields.playerName.trim() === '') found.playerName = 'Enter the player name.';
    const email = fields.playerEmail.trim();
    if (email !== '' && !EMAIL.test(email))
      found.playerEmail = 'Enter an email address like name@example.com, or leave it blank.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const choicesChanged =
      JSON.stringify(Object.entries(fields.choices).sort()) !==
      JSON.stringify(Object.entries(initialChoices).sort());
    const cmd: UpdateProfileCommand = {
      type: 'updateProfile',
      characterName: fields.characterName.trim(),
      playerName: fields.playerName.trim(),
      playerEmail: email,
      concept: fields.concept.trim(),
      backstory: fields.backstory,
      notes: fields.notes,
      ageCategory: fields.ageCategory,
      ...(race && fields.literacy !== race.literacy ? { literacy: fields.literacy } : {}),
      ...(choicesChanged ? { choices: fields.choices } : {}),
    };
    const result = await command.run(cmd, { success: 'Profile saved.' });
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit profile"
      actions={
        <>
          <Button variant="primary" type="submit" form={formId} aria-busy={command.running}>
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
              onChange={(e) => set('characterName', e.target.value)}
            />
          )}
        </Field>
        <Field label="Player name" required error={errors.playerName}>
          {(control) => (
            <input
              {...control}
              autoComplete="off"
              value={fields.playerName}
              onChange={(e) => set('playerName', e.target.value)}
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
              onChange={(e) => set('playerEmail', e.target.value)}
            />
          )}
        </Field>
        <Field label="Concept" hint="Optional.">
          {(control) => (
            <input
              {...control}
              autoComplete="off"
              value={fields.concept}
              onChange={(e) => set('concept', e.target.value)}
            />
          )}
        </Field>
        <Field label="Age category" hint={`${minAgeCategory} to ${maxAgeCategory}.`}>
          {(control) => (
            <select
              {...control}
              value={fields.ageCategory}
              onChange={(e) => set('ageCategory', Number(e.target.value))}
            >
              {Array.from({ length: maxAgeCategory - minAgeCategory + 1 }, (_, i) => (
                <option key={i} value={minAgeCategory + i}>
                  {minAgeCategory + i}
                </option>
              ))}
            </select>
          )}
        </Field>
        {race && raceDef && raceDef.language !== 'common' ? (
          <Field label="Reads and writes">
            {(control) => (
              <select
                {...control}
                value={fields.literacy}
                onChange={(e) => set('literacy', e.target.value as Fields['literacy'])}
              >
                <option value="race-language">{languageName(ruleset, raceDef.language)}</option>
                <option value="common">{languageName(ruleset, 'common')}</option>
              </select>
            )}
          </Field>
        ) : null}
        {raceDef?.choices.map((def) => {
          const value = fields.choices[def.id] ?? '';
          if (def.kind === 'pick' || def.kind === 'language')
            return (
              <Field key={def.id} label={def.label}>
                {(control) => (
                  <select
                    {...control}
                    value={value}
                    onChange={(e) => setChoice(def.id, e.target.value)}
                  >
                    <option value="">Not chosen</option>
                    {def.kind === 'pick'
                      ? (def.options ?? []).map((o) => (
                          <option key={o} value={o}>
                            {choiceOptionLabel(ruleset, raceDef, def.id, o)}
                          </option>
                        ))
                      : ruleset.ruleset.languages.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                  </select>
                )}
              </Field>
            );
          return (
            <Field key={def.id} label={def.label} hint="Optional.">
              {(control) => (
                <input
                  {...control}
                  autoComplete="off"
                  value={value}
                  onChange={(e) => setChoice(def.id, e.target.value)}
                />
              )}
            </Field>
          );
        })}
        <Field label="Backstory">
          {(control) => (
            <textarea
              {...control}
              rows={6}
              value={fields.backstory}
              onChange={(e) => set('backstory', e.target.value)}
            />
          )}
        </Field>
        <Field label="Notes" hint="Staff notes about this character.">
          {(control) => (
            <textarea
              {...control}
              value={fields.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          )}
        </Field>
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}
