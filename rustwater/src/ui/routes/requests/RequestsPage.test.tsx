import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset, plan, type Command } from '../../../engine/index.ts';
import type {
  LearnSkillRequest,
  Request,
  Settings,
  StoredCharacter,
} from '../../../engine/model.ts';
import { App } from '../../App.tsx';
import {
  createMemoryRepository,
  type MemoryRepositoryOptions,
} from '../../data/memoryRepository.ts';
import { mira } from '../../test/fixtures.ts';
import { TEST_PLAYER, TEST_STAFF, renderApp } from '../../test/renderApp.tsx';

const STAFF: Settings = { mode: 'staff', theme: 'system' };
const MIRA_ID = mira().id;

function request(overrides: Partial<LearnSkillRequest> = {}): LearnSkillRequest {
  return {
    id: 'req-assault',
    characterId: MIRA_ID,
    createdAt: '2026-10-05T10:00:00.000Z',
    kind: 'learn-skill',
    skillId: 'assault',
    part: 'basic',
    toLevel: 1,
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

describe('I learned this skill (player)', () => {
  it('sends a request with part, level, teacher, and note', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${MIRA_ID}/skills/assault`, { characters: [mira()] });

    await user.click(await screen.findByRole('button', { name: 'I learned Assault' }));
    const dialog = screen.getByRole('dialog', { name: 'I learned Assault' });
    expect(within(dialog).queryByLabelText(/Part/)).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Target level/)).toHaveValue('1');
    expect(dialog).toHaveTextContent('If approved: 10 CXP.');

    // A new skill needs a teacher.
    await user.click(within(dialog).getByRole('button', { name: 'Send to staff' }));
    expect(dialog).toHaveTextContent("Enter the teacher's name.");
    expect(repository.data.requests.size).toBe(0);

    await user.selectOptions(within(dialog).getByLabelText(/Target level/), '2');
    expect(dialog).toHaveTextContent('If approved: 30 CXP.');
    await user.type(within(dialog).getByLabelText(/Who taught you/), '  Old Tom ');
    await user.type(within(dialog).getByLabelText(/Note/), 'At the gate.');
    await user.click(within(dialog).getByRole('button', { name: 'Send to staff' }));

    await waitFor(() => expect(repository.data.requests.size).toBe(1));
    const [saved] = [...repository.data.requests.values()];
    expect(saved).toMatchObject({
      characterId: MIRA_ID,
      kind: 'learn-skill',
      skillId: 'assault',
      part: 'basic',
      toLevel: 2,
      teacher: 'Old Tom',
      note: 'At the gate.',
      status: 'sent',
    });
    expect(
      screen.getByText('Sent Assault to staff. Their answer shows under My learning requests.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks for the archetype of a multi-archetype skill not owned yet', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${MIRA_ID}/skills/bardic-performance`, {
      characters: [mira()],
    });

    await user.click(await screen.findByRole('button', { name: 'I learned Bardic Performance' }));
    const dialog = screen.getByRole('dialog', { name: 'I learned Bardic Performance' });
    const archetype = within(dialog).getByLabelText(/Archetype/);
    expect(archetype).toHaveValue('');
    expect(dialog).not.toHaveTextContent('Staff may not be able to approve this yet');
    await user.type(within(dialog).getByLabelText(/Who taught you/), 'Lark');
    await user.click(within(dialog).getByRole('button', { name: 'Send to staff' }));
    expect(dialog).toHaveTextContent('Choose the archetype for Bardic Performance.');
    expect(repository.data.requests.size).toBe(0);

    await user.selectOptions(archetype, 'magic');
    await user.click(within(dialog).getByRole('button', { name: 'Send to staff' }));
    await waitFor(() => expect(repository.data.requests.size).toBe(1));
    const [saved] = [...repository.data.requests.values()];
    expect(saved).toMatchObject({ skillId: 'bardic-performance', archetype: 'magic' });
  });

  it('does not ask for an archetype for a single-archetype skill', async () => {
    const user = userEvent.setup();
    const { repository } = renderApp(`/c/${MIRA_ID}/skills/assault`, { characters: [mira()] });
    await user.click(await screen.findByRole('button', { name: 'I learned Assault' }));
    const dialog = screen.getByRole('dialog', { name: 'I learned Assault' });
    expect(within(dialog).queryByLabelText(/Archetype/)).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Who taught you/), 'Old Tom');
    await user.click(within(dialog).getByRole('button', { name: 'Send to staff' }));
    await waitFor(() => expect(repository.data.requests.size).toBe(1));
    expect('archetype' in [...repository.data.requests.values()][0]!).toBe(false);
  });

  it('offers a + next to each level on the skills list, including skills not owned yet', async () => {
    const user = userEvent.setup();
    renderApp(`/c/${MIRA_ID}/skills`, { characters: [mira()] });
    await screen.findByText(/tap \+ next to the level you learned/);
    await user.click(screen.getByRole('checkbox', { name: 'Owned only' }));
    await user.click(await screen.findByRole('button', { name: /^Assault/ }));
    expect(screen.getByRole('button', { name: 'I learned Assault Adept' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'I learned Assault' }));
    const dialog = screen.getByRole('dialog', { name: 'I learned Assault' });
    expect(within(dialog).getByLabelText(/Who taught you/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is not offered in staff mode', async () => {
    renderApp(`/c/${MIRA_ID}/skills/assault`, { characters: [mira()], settings: STAFF });
    await screen.findByRole('heading', { level: 2, name: 'Assault' });
    expect(screen.queryByRole('button', { name: /^I learned/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'I learned Assault' })).not.toBeInTheDocument();
  });
});

describe('Requests (player)', () => {
  it('lists requests with status badges and lets the player withdraw a waiting one', async () => {
    const user = userEvent.setup();
    const { repository } = renderWith('/requests', { characters: [mira()] }, [
      request({ id: 'req-bash', skillId: 'bash', note: '' }),
      request({ id: 'req-sent', toLevel: 2 }),
    ]);
    const section = await screen.findByRole('region', { name: 'Mira Voss' });
    expect(within(section).getAllByText('Pending')).toHaveLength(2);
    expect(within(section).getByRole('region', { name: 'Assault level 2' })).toHaveTextContent(
      'Waiting for staff',
    );

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
    const card = await screen.findByRole('region', { name: 'Assault level 1' });
    expect(card).toHaveTextContent('Rejected');
    expect(card).toHaveTextContent('No teacher at that event.');
    expect(within(card).queryByRole('button', { name: /Withdraw/ })).not.toBeInTheDocument();
  });
});

describe('Learnings in Staff tools', () => {
  /** Requests are grouped by player; test characters have none. */
  async function openPlayer() {
    await userEvent.click(await screen.findByRole('button', { name: /^No player/ }));
  }

  it('shows the check and approves with the teacher from the request', async () => {
    const user = userEvent.setup();
    const { repository } = renderWith(
      '/staff/approvals',
      { characters: [mira()], settings: STAFF },
      [request()],
    );
    await openPlayer();
    const card = await screen.findByRole('region', { name: 'Assault level 1' });
    expect(card).toHaveTextContent('Still valid. Costs 10 CXP.');
    expect(card).toHaveTextContent('Old Tom');
    expect(card).toHaveTextContent('Taught at the Harvest Moon.');

    await user.click(within(card).getByRole('button', { name: 'Approve Assault level 1' }));
    const dialog = screen.getByRole('dialog', { name: 'Approve Assault level 1 for Mira Voss?' });
    expect(dialog).toHaveTextContent('Costs 10 CXP.');
    const teacher = within(dialog).getByLabelText(/Teacher/);
    expect(teacher).toHaveValue('Old Tom');
    await user.clear(teacher);
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(dialog).toHaveTextContent("Enter the teacher's name.");
    await user.type(teacher, 'Old Tom Barrow');
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('Approved Assault level 1 for Mira Voss.')).toBeInTheDocument();
    await screen.findByText('No learnings waiting.');
    expect(repository.data.requests.get('req-assault')?.status).toBe('approved');
    const actions = repository.data.characters.get(MIRA_ID)?.actions ?? [];
    const learned = actions.find((a) => a.type === 'skill.learned');
    expect(learned?.causedBy).toBe('req-assault');
    expect(learned?.payload).toMatchObject({
      skillId: 'assault',
      toLevel: 1,
      teacher: 'Old Tom Barrow',
    });
    expect(learned?.actor.role).toBe('staff');
    expect(actions.at(-1)?.type).toBe('request.approved');
  });

  it('approves a multi-archetype request in the archetype from the request, which staff can change', async () => {
    const user = userEvent.setup();
    const bard = request({ id: 'req-bard', skillId: 'bardic-performance', archetype: 'magic' });
    const { repository } = renderWith(
      '/staff/approvals',
      { characters: [mira()], settings: STAFF },
      [bard],
    );
    await openPlayer();
    const card = await screen.findByRole('region', { name: 'Bardic Performance level 1' });
    expect(card).toHaveTextContent('Still valid.');

    await user.click(
      within(card).getByRole('button', { name: 'Approve Bardic Performance level 1' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Approve Bardic Performance level 1 for Mira Voss?',
    });
    const archetype = within(dialog).getByLabelText(/Archetype/);
    expect(archetype).toHaveValue('magic');
    await user.selectOptions(archetype, 'utility');
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

    expect(
      await screen.findByText('Approved Bardic Performance level 1 for Mira Voss.'),
    ).toBeInTheDocument();
    const actions = repository.data.characters.get(MIRA_ID)?.actions ?? [];
    expect(actions.find((a) => a.type === 'skill.learned')?.payload).toMatchObject({
      skillId: 'bardic-performance',
      archetype: 'utility',
    });
  });

  it('asks staff for the archetype when an older request has none', async () => {
    const user = userEvent.setup();
    const { repository } = renderWith(
      '/staff/approvals',
      { characters: [mira()], settings: STAFF },
      [request({ id: 'req-bard', skillId: 'bardic-performance' })],
    );
    await openPlayer();
    const card = await screen.findByRole('region', { name: 'Bardic Performance level 1' });
    expect(card).toHaveTextContent(
      'Choose the archetype for Bardic Performance: Utility or Magic.',
    );

    await user.click(
      within(card).getByRole('button', { name: 'Approve Bardic Performance level 1' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Approve Bardic Performance level 1 for Mira Voss?',
    });
    const archetype = within(dialog).getByLabelText(/Archetype/);
    expect(archetype).toHaveValue('');
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(dialog).toHaveTextContent('Choose the archetype for Bardic Performance.');
    expect(repository.data.characters.get(MIRA_ID)?.actions).toHaveLength(1);

    await user.selectOptions(archetype, 'magic');
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(
      await screen.findByText('Approved Bardic Performance level 1 for Mira Voss.'),
    ).toBeInTheDocument();
    const actions = repository.data.characters.get(MIRA_ID)?.actions ?? [];
    expect(actions.find((a) => a.type === 'skill.learned')?.payload).toMatchObject({
      archetype: 'magic',
    });
  });

  it('rejects only with a reason', async () => {
    const user = userEvent.setup();
    const { repository } = renderWith(
      '/staff/approvals',
      { characters: [mira()], settings: STAFF },
      [request()],
    );
    await openPlayer();
    await user.click(await screen.findByRole('button', { name: 'Reject Assault level 1' }));
    const dialog = screen.getByRole('dialog', { name: 'Reject Assault level 1 for Mira Voss?' });
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    expect(dialog).toHaveTextContent('Enter a reason for the player.');
    expect(repository.data.characters.get(MIRA_ID)?.actions).toHaveLength(1);

    await user.type(within(dialog).getByLabelText(/Reason/), 'Not taught in game.');
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('Rejected Assault level 1 for Mira Voss.')).toBeInTheDocument();
    expect(repository.data.requests.get('req-assault')?.status).toBe('rejected');
    const last = repository.data.characters.get(MIRA_ID)?.actions.at(-1);
    expect(last?.type).toBe('request.rejected');
    expect(last?.payload).toMatchObject({ reason: 'Not taught in game.' });
  });

  it('shows why a request cannot be approved', async () => {
    renderWith('/staff/approvals', { characters: [mira()], settings: STAFF }, [
      request({ id: 'req-mastery', part: 'mastery', toLevel: 1 }),
    ]);
    await openPlayer();
    const card = await screen.findByRole('region', { name: 'Assault Mastery' });
    expect(card).toHaveTextContent('Cannot be approved now.');
    expect(card).toHaveTextContent('Needs Assault level 9.');
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
