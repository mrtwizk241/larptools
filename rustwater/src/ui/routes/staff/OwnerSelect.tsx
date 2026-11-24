import type { UserInfo } from '../../../api/contract.ts';
import { Field } from '../../components/index.ts';
import { ownerChoices } from '../../data/accounts.ts';

export interface OwnerSelectProps {
  users: readonly UserInfo[];
  /** Account id, or '' for unassigned. */
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}

/** "Player account": unassigned, or one account. */
export function OwnerSelect({ users, value, onChange, hint }: OwnerSelectProps) {
  return (
    <Field
      label="Player account"
      hint={hint ?? 'The player who can see this character. Leave unassigned to decide later.'}
    >
      {(control) => (
        <select {...control} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Unassigned</option>
          {ownerChoices(users).map((user) => (
            <option key={user.id} value={user.id}>
              {`${user.name} (${user.email})${user.role === 'player' ? '' : ', staff'}`}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
