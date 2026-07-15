import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const helpers = vi.hoisted(() => ({
  clearMergeState: vi.fn(),
}));

vi.mock('@/lib/account-merge', () => helpers);
vi.mock('@/lib/useTheme', () => ({
  useTheme: () => ({ isDark: false, toggleTheme: vi.fn() }),
}));
vi.mock('../LinkedEmailsSection', () => ({
  LinkedEmailsSection: () => null,
}));

import { ProfileDialog } from '../ProfileDialog';

const originalLocation = window.location;

afterEach(() => {
  vi.clearAllMocks();
  window.location = originalLocation;
});

describe('ProfileDialog combine another account', () => {
  it('clears any stale merge state before navigating to start a fresh merge', async () => {
    const calls: string[] = [];
    helpers.clearMergeState.mockImplementation(() => calls.push('clearMergeState'));
    // @ts-expect-error - simplified location stub for assertion ordering
    delete window.location;
    window.location = { ...originalLocation, href: '' } as unknown as Location;
    Object.defineProperty(window.location, 'href', {
      set(value: string) {
        calls.push(`navigate:${value}`);
      },
      configurable: true,
    });

    render(
      <ProfileDialog
        open={true}
        onOpenChange={() => {}}
        onSignOut={() => {}}
        onDeleteAccount={() => {}}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /combine another account/i }));

    expect(helpers.clearMergeState).toHaveBeenCalled();
    expect(calls).toEqual(['clearMergeState', 'navigate:/?merge=start']);
  });
});
