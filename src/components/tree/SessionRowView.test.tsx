import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatSessionDate } from '@/lib/utils';
import type { SessionData } from '@/schema/folder';
import { SessionRowView } from './SessionRowView';

const { showConfirm } = vi.hoisted(() => ({ showConfirm: vi.fn() }));

vi.mock('@/lib/dialog-context', () => ({
  useDialog: () => ({ showConfirm, showAlert: vi.fn() }),
}));

const CREATED_AT = new Date('2024-11-01T12:00:00').getTime();
const DATE_LABEL = formatSessionDate(new Date(CREATED_AT), false);

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    id: 'session-1',
    itemStates: {},
    archived: false,
    categoryExpanded: {},
    viewMode: 'flat',
    selectedCount: 0,
    checkedCount: 0,
    remainingCount: 0,
    createdAt: CREATED_AT,
    lastActivityAt: CREATED_AT,
    ...overrides,
  };
}

function renderRow(
  session: SessionData,
  props: Partial<Parameters<typeof SessionRowView>[0]> = {},
) {
  const onRename = vi.fn();
  const onArchive = vi.fn();
  render(
    <SessionRowView
      session={session}
      templateName="Groceries"
      level={1}
      onOpen={vi.fn()}
      onArchive={onArchive}
      onRename={onRename}
      allSessions={[session]}
      {...props}
    />,
  );
  return { onRename, onArchive };
}

async function startRename(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /more options/i }));
  await user.click(screen.getByText('Rename'));
  return screen.getByRole('textbox');
}

// Opening the Radix menu costs ~0.7s idle and passes the 5s default on a loaded host.
describe('SessionRowView', { timeout: 15_000 }, () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('label', () => {
    it('shows the date label when the session has no name', () => {
      renderRow(makeSession());
      expect(screen.getByText(DATE_LABEL)).toBeInTheDocument();
    });

    it('shows the date label when the name is blank', () => {
      renderRow(makeSession({ name: '' }));
      expect(screen.getByText(DATE_LABEL)).toBeInTheDocument();
    });

    it('shows the session name instead of the date when set', () => {
      renderRow(makeSession({ name: 'Party prep' }));
      expect(screen.getByText('Party prep')).toBeInTheDocument();
      expect(screen.queryByText(DATE_LABEL)).not.toBeInTheDocument();
    });

    it('uses the session name in the archive confirmation', async () => {
      const user = userEvent.setup();
      showConfirm.mockResolvedValue(true);
      renderRow(makeSession({ name: 'Party prep' }));

      await user.click(screen.getByRole('button', { name: /more options/i }));
      await user.click(screen.getByText('Archive'));

      expect(showConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Groceries - Party prep' }),
      );
    });
  });

  describe('rename', () => {
    it('opens an inline input holding the current name', async () => {
      const user = userEvent.setup();
      renderRow(makeSession({ name: 'Party prep' }));

      const input = await startRename(user);

      expect(input).toHaveValue('Party prep');
      expect(input).toHaveFocus();
    });

    it('saves the new name on Enter', async () => {
      const user = userEvent.setup();
      const { onRename } = renderRow(makeSession());

      const input = await startRename(user);
      await user.type(input, 'Weekly shop{Enter}');

      expect(onRename).toHaveBeenCalledWith('session-1', 'Weekly shop');
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('saves on blur', async () => {
      const user = userEvent.setup();
      const { onRename } = renderRow(makeSession());

      const input = await startRename(user);
      await user.type(input, 'Weekly shop');
      await user.tab();

      expect(onRename).toHaveBeenCalledWith('session-1', 'Weekly shop');
    });

    it('saves a cleared name so the date label returns', async () => {
      const user = userEvent.setup();
      const { onRename } = renderRow(makeSession({ name: 'Party prep' }));

      const input = await startRename(user);
      await user.clear(input);
      await user.type(input, '{Enter}');

      expect(onRename).toHaveBeenCalledWith('session-1', '');
    });

    it('cancels on Escape without saving', async () => {
      const user = userEvent.setup();
      const { onRename } = renderRow(makeSession({ name: 'Party prep' }));

      const input = await startRename(user);
      await user.type(input, ' extra{Escape}');

      expect(onRename).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.getByText('Party prep')).toBeInTheDocument();
    });

    it('does not save an unchanged name', async () => {
      const user = userEvent.setup();
      const { onRename } = renderRow(makeSession({ name: 'Party prep' }));

      const input = await startRename(user);
      await user.type(input, '{Enter}');

      expect(onRename).not.toHaveBeenCalled();
    });

    it('hides the rename action when no rename handler is given', async () => {
      const user = userEvent.setup();
      renderRow(makeSession(), { onRename: undefined });

      await user.click(screen.getByRole('button', { name: /more options/i }));

      expect(screen.queryByText('Rename')).not.toBeInTheDocument();
    });
  });
});
