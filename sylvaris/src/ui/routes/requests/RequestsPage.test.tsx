import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset, plan, type Command } from '../../../engine/index.ts';
import type { Request, Settings, StoredCharacter } from '../../../engine/model.ts';
import { App } from '../../App.tsx';
import {
  createMemoryRepository,
  type MemoryRepositoryOptions,
} from '../../data/memoryRepository.ts';
import { mira } from '../../test/fixtures.ts';
import { TEST_PLAYER, TEST_STAFF } from '../../test/renderApp.tsx';
import { ash } from '../../test/veteran.ts';

const STAFF: Settings = { mode: 'staff', theme: 'system' };
const MIRA_ID = mira().id;

function request(overrides: Partial<Request> = {}): Request {
  return {
    id: 'req-stun',
    characterId: MIRA_ID,
    createdAt: '2026-10-05T10:00:00.000Z',
    kind: 'learn-skill',
    skillId: 'stun',
    step: { level: 1 },
    teacher: 'Old Tom',
    note: 'Taught at the Harvest Moon.',
    status: 'sent',
    ...overrides,
  };
}

/** Renders the app with requests already stored. */
function renderWith(route: string, options: MemoryRepositoryOptions, requests: Request[]) {
  window.location.hash = `#${route}`;
  const repository = createMemoryRepository(options);
  for (const r of requests) repository.data.requests.set(r.id, r);
  const user = options.settings?.mode === 'staff' ? TEST_STAFF : TEST_PLAYER;
  render(<App repository={repository} user={user} />);
  return { repository };
}

/** Mira after staff commands, planned by the engine. */
function miraAfter(commands: readonly Command[]): StoredCharacter {
  const ruleset = loadRuleset();
  const character = mira();
  const actions = [...character.actions];
  let n = 0;
  for (const command of commands) {
    const result = plan(ruleset, deriveSheet(ruleset, actions), command, {
      actor: { role: 'staff', name: 'Desk' },
      now: () => '2026-10-10T21:00:00.000Z',
      newId: () => `mira-extra-${++n}`,
      nextSeq: actions.length + 1,
    });
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' '));
    actions.push(...result.actions);
  }
  return { ...character, actions };
}

describe('Requests (player)', () => {
  it('lists requests with status badges and lets the player withdraw a waiting one', async () => {
    const user = userEvent.setup();
    const { repository } = renderWith('/requests', { characters: [mira()] }, [
      request({ id: 'req-bash', skillId: 'bash', note: '' }),
      request({ id: 'req-sent', skillId: 'toughness', step: { technique: 'expert' } }),
    ]);
    const section = await screen.findByRole('region', { name: 'Mira Voss' });
    expect(within(section).getAllByText('Pending')).toHaveLength(2);
    expect(
      within(section).getByRole('region', { name: 'Toughness Expert Technique' }),
    ).toHaveTextContent('Waiting for staff');

    await user.click(
      within(section).getByRole('button', { name: 'Withdraw the request for Bash level 1' }),
    );
    const confirm = screen.getByRole('dialog', { name: 'Withdraw this request?' });
    await user.click(within(confirm).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(repository.data.requests.has('req-bash')).toBe(false));
    expect(await screen.findByText('Withdrew the request for Bash level 1.')).toBeInTheDocument();
  });

  it('shows a staff decision from the character log', async () => {
    const staffCopy = miraAfter([
      { type: 'rejectRequest', request: request(), reason: 'No teacher at that event.' },
    ]);
    renderWith('/requests', { characters: [staffCopy] }, [request()]);
    const card = await screen.findByRole('region', { name: 'Stun level 1' });
    expect(card).toHaveTextContent('Rejected');
    expect(card).toHaveTextContent('No teacher at that event.');
    expect(within(card).queryByRole('button', { name: /Withdraw/ })).not.toBeInTheDocument();
  });
});

describe('Learnings in Staff tools', () => {
  it('shows the check and approves with the teacher from the request', async () => {
    const user = userEvent.setup();
    const { repository } = renderWith(
      '/staff/approvals',
      { characters: [mira()], settings: STAFF },
      [request()],
    );
    const card = await screen.findByRole('region', { name: 'Stun level 1' });
    expect(card).toHaveTextContent('Still valid. Costs 5 XP.');
    expect(card).toHaveTextContent('Old Tom');
    expect(card).toHaveTextContent('Taught at the Harvest Moon.');

    await user.click(within(card).getByRole('button', { name: 'Approve Stun level 1' }));
    const dialog = screen.getByRole('dialog', { name: 'Approve Stun level 1 for Mira Voss?' });
    expect(dialog).toHaveTextContent('Costs 5 XP.');
    const teacher = within(dialog).getByLabelText(/Teacher/);
    expect(teacher).toHaveValue('Old Tom');
    await user.clear(teacher);
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(dialog).toHaveTextContent("Enter the teacher's name.");
    await user.type(teacher, 'Old Tom Barrow');
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('Approved Stun level 1 for Mira Voss.')).toBeInTheDocument();
    await screen.findByText('No learnings waiting.');
    expect(repository.data.requests.get('req-stun')?.status).toBe('approved');
    const actions = repository.data.characters.get(MIRA_ID)?.actions ?? [];
    const learned = actions.find((a) => a.type === 'skill.learned' && a.causedBy === 'req-stun');
    expect(learned?.payload).toMatchObject({
      skillId: 'stun',
      step: { level: 1 },
      currency: 'xp',
      cost: 5,
      teacher: 'Old Tom Barrow',
      atCreation: false,
    });
    expect(learned?.actor.role).toBe('staff');
    expect(actions.at(-1)?.type).toBe('request.approved');
  });

  it('rejects only with a reason', async () => {
    const user = userEvent.setup();
    const { repository } = renderWith(
      '/staff/approvals',
      { characters: [mira()], settings: STAFF },
      [request()],
    );
    await user.click(await screen.findByRole('button', { name: 'Reject Stun level 1' }));
    const dialog = screen.getByRole('dialog', { name: 'Reject Stun level 1 for Mira Voss?' });
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    expect(dialog).toHaveTextContent('Enter a reason for the player.');
    expect(repository.data.characters.get(MIRA_ID)?.actions).toHaveLength(mira().actions.length);

    await user.type(within(dialog).getByLabelText(/Reason/), 'Not taught in game.');
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('Rejected Stun level 1 for Mira Voss.')).toBeInTheDocument();
    expect(repository.data.requests.get('req-stun')?.status).toBe('rejected');
    const last = repository.data.characters.get(MIRA_ID)?.actions.at(-1);
    expect(last?.type).toBe('request.rejected');
    expect(last?.payload).toMatchObject({ reason: 'Not taught in game.' });
  });

  it('records the event chosen on approval', async () => {
    const user = userEvent.setup();
    const veteran = ash();
    const { repository } = renderWith(
      '/staff/approvals',
      { characters: [veteran], settings: STAFF },
      [
        request({
          id: 'req-ash',
          characterId: veteran.id,
          skillId: 'deflection',
          step: { technique: 'expert' },
          teacher: 'Captain Dorn',
        }),
      ],
    );
    const card = await screen.findByRole('region', { name: 'Deflection Expert Technique' });
    await user.click(
      within(card).getByRole('button', { name: 'Approve Deflection Expert Technique' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Approve Deflection Expert Technique for Ash Merrow?',
    });
    await user.selectOptions(within(dialog).getByLabelText(/Event/), '2026-09-19-harvest-moon');
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await screen.findByText('Approved Deflection Expert Technique for Ash Merrow.');
    const actions = repository.data.characters.get(veteran.id)?.actions ?? [];
    const learned = actions.find((a) => a.type === 'skill.learned' && a.causedBy === 'req-ash');
    expect(learned?.eventKey).toBe('2026-09-19-harvest-moon');
  });

  it('shows why a request cannot be approved', async () => {
    renderWith('/staff/approvals', { characters: [mira()], settings: STAFF }, [
      request({ id: 'req-master', skillId: 'toughness', step: { technique: 'master' } }),
    ]);
    const card = await screen.findByRole('region', { name: 'Toughness Master Technique' });
    expect(card).toHaveTextContent('Cannot be approved now.');
    expect(card).toHaveTextContent(/Toughness Master Technique: /);
  });
});

describe('Roster requests link', () => {
  it('shows the pending count', async () => {
    renderWith('/', { characters: [mira()], settings: STAFF }, [
      request({ id: 'a' }),
      request({ id: 'b', status: 'approved' }),
    ]);
    const link = await screen.findByRole('link', { name: /Requests/ });
    expect(link).toHaveAttribute('href', '#/requests');
    await waitFor(() => expect(link).toHaveTextContent('1 pending'));
  });
});
