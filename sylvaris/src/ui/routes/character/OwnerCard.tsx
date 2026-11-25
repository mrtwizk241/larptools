// Staff, with the server: which player account this character belongs to, and changing it.
import { useState } from 'react';
import { api, errorMessage } from '../../../api/client.ts';
import { Alert, Button, Card, useToast } from '../../components/index.ts';
import { useAccounts } from '../../data/accounts.ts';
import { OwnerSelect } from '../staff/OwnerSelect.tsx';
import type { CharacterView } from './view.ts';
import styles from './character.module.css';

export function OwnerCard({ view }: { view: CharacterView }) {
  const accounts = useAccounts();
  const toast = useToast();
  const [owner, setOwner] = useState(view.meta?.ownerId ?? '');
  const [saved, setSaved] = useState(view.meta?.ownerId ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  if (!view.meta || accounts.status === 'none') return null;
  const users = accounts.status === 'ready' ? accounts.users : [];
  const current = users.find((u) => u.id === saved);

  async function save() {
    setProblem(null);
    try {
      const entry = await api.setOwner(view.id, owner === '' ? null : owner);
      setSaved(entry.meta.ownerId ?? '');
      toast.show(
        entry.meta.ownerName ? `Now belongs to ${entry.meta.ownerName}.` : 'Now unassigned.',
      );
    } catch (error) {
      setProblem(errorMessage(error));
    }
  }

  return (
    <Card title="Player account" headingLevel={3}>
      <div className={styles.form}>
        <p>
          {current
            ? `${current.name} (${current.email}) sees this character.`
            : 'No player account. Only staff see this character.'}
        </p>
        {problem ? <Alert>{problem}</Alert> : null}
        {accounts.status === 'ready' ? (
          <>
            <OwnerSelect users={users} value={owner} onChange={setOwner} />
            <div>
              <Button disabled={owner === saved} onClick={() => void save()}>
                Save player account
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}
