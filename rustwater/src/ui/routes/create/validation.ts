// Field checks shared by the create wizard and the profile edit form. Plain-English messages.
import { AGE_STEP_MAX, AGE_STEP_MIN, AGE_STEP_START_MIN } from '../../../engine/rules/age.ts';

export interface ProfileFields {
  characterName: string;
  playerName: string;
  playerEmail: string;
  age: string;
}

export type ProfileErrors = Partial<Record<keyof ProfileFields, string>>;

export const MAX_NAME = 200;
export const MAX_EMAIL = 320;
/** Age is a step from 1 to 10; new characters start at 2 or higher ([ANC-AGE]). */
export const MIN_AGE = AGE_STEP_MIN;
export const MAX_AGE = AGE_STEP_MAX;
export const MIN_START_AGE = AGE_STEP_START_MIN;
export const DEFAULT_START_AGE = String(AGE_STEP_START_MIN);
export const AGE_HELP =
  'Age is a step from 1 to 10. Each step is 10% of a full life for your ancestry. New characters start at 2 or higher.';
/** Hint on the profile edit form, where the age may also be left blank. */
export const PROFILE_AGE_HELP =
  'Optional. Age is a step from 1 to 10. Each step is 10% of a full life for the ancestry.';

export interface AgeRule {
  /** Lowest step allowed: 1 on the profile form, 2 for a new character. */
  min: number;
  /** True when the age cannot be left blank (the create wizard). */
  required: boolean;
}

/** The profile form: any step 1 to 10, or blank to clear it. */
export const PROFILE_AGE: AgeRule = { min: MIN_AGE, required: false };
/** The create wizard: a step 2 to 10. */
export const NEW_CHARACTER_AGE: AgeRule = { min: MIN_START_AGE, required: true };

const EMAIL = /^[^\s@]+@[^\s@]+$/;
const WHOLE = /^\d+$/;

export function profileFieldErrors(
  fields: ProfileFields,
  ageRule: AgeRule = PROFILE_AGE,
): ProfileErrors {
  const errors: ProfileErrors = {};
  const character = fields.characterName.trim();
  const player = fields.playerName.trim();
  const email = fields.playerEmail.trim();
  const age = fields.age.trim();
  if (character === '') errors.characterName = 'Enter the character name.';
  else if (character.length > MAX_NAME)
    errors.characterName = `Keep the character name to ${MAX_NAME} characters.`;
  if (player === '') errors.playerName = 'Enter the player name.';
  else if (player.length > MAX_NAME)
    errors.playerName = `Keep the player name to ${MAX_NAME} characters.`;
  if (email !== '' && (!EMAIL.test(email) || email.length > MAX_EMAIL))
    errors.playerEmail = 'Enter an email address like name@example.com, or leave it blank.';
  const ageOk = WHOLE.test(age) && Number(age) >= ageRule.min && Number(age) <= MAX_AGE;
  if (age === '' ? ageRule.required : !ageOk)
    errors.age = ageRule.required
      ? `Enter an age step from ${ageRule.min} to ${MAX_AGE}.`
      : `Enter an age step from ${ageRule.min} to ${MAX_AGE}, or leave it blank.`;
  return errors;
}

/** The age field as a number, or undefined when blank. Call after profileFieldErrors passes. */
export function parseAge(age: string): number | undefined {
  const text = age.trim();
  return text === '' ? undefined : Number(text);
}
