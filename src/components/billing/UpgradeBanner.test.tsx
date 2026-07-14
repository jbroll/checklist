/**
 * Tests for UpgradeBanner component
 * Uses jazz-mock for CoValue mocking.
 */

import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpgradeBanner } from './UpgradeBanner';

// Mock subscription service
vi.mock('../../services/subscriptionService', () => ({
  getSubscriptionTier: vi.fn(),
  isApproachingLimit: vi.fn(),
  countUserLists: vi.fn(),
  getMaxLists: vi.fn(),
  getListsRemaining: vi.fn(),
}));

// The component reads the graph via useRowboat(); subscriptionService is mocked, so the graph
// value is unused — a stub is enough.
vi.mock('@/jazz', () => ({ useRowboat: () => ({}) }));

import {
  countUserLists,
  getListsRemaining,
  getMaxLists,
  getSubscriptionTier,
  isApproachingLimit,
} from '../../services/subscriptionService';

describe('UpgradeBanner', () => {
  const defaultProps = {
    onUpgradeClick: vi.fn(),
  };

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();

    // Default mock setup: free tier user approaching limit
    vi.mocked(getSubscriptionTier).mockReturnValue('free');
    vi.mocked(isApproachingLimit).mockReturnValue(true);
    vi.mocked(countUserLists).mockReturnValue(4);
    vi.mocked(getMaxLists).mockReturnValue(5);
    vi.mocked(getListsRemaining).mockReturnValue(1);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('visibility conditions', () => {
    it('shows banner for free tier user approaching limit', () => {
      render(<UpgradeBanner {...defaultProps} />);

      expect(screen.getByText(/you're using 4 of 5 lists/i)).toBeInTheDocument();
      expect(screen.getByText(/1 remaining/i)).toBeInTheDocument();
    });

    it('does not show banner for paid tier users', () => {
      vi.mocked(getSubscriptionTier).mockReturnValue('pro');

      render(<UpgradeBanner {...defaultProps} />);

      expect(screen.queryByText(/you're using/i)).not.toBeInTheDocument();
    });

    it('does not show banner when not approaching limit', () => {
      vi.mocked(isApproachingLimit).mockReturnValue(false);

      render(<UpgradeBanner {...defaultProps} />);

      expect(screen.queryByText(/you're using/i)).not.toBeInTheDocument();
    });

    it('does not show banner if recently dismissed', () => {
      // Set dismissed timestamp to 1 hour ago (within 24hr window)
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      localStorage.setItem('checklist_upgrade_banner_dismissed', oneHourAgo.toString());

      render(<UpgradeBanner {...defaultProps} />);

      expect(screen.queryByText(/you're using/i)).not.toBeInTheDocument();
    });

    it('shows banner if dismissal expired (>24 hours)', () => {
      // Set dismissed timestamp to 25 hours ago (outside 24hr window)
      const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
      localStorage.setItem('checklist_upgrade_banner_dismissed', twentyFiveHoursAgo.toString());

      render(<UpgradeBanner {...defaultProps} />);

      expect(screen.getByText(/you're using/i)).toBeInTheDocument();
    });
  });

  describe('content display', () => {
    it('shows "Upgrade to create more" when at limit', () => {
      vi.mocked(countUserLists).mockReturnValue(5);
      vi.mocked(getListsRemaining).mockReturnValue(0);

      render(<UpgradeBanner {...defaultProps} />);

      expect(screen.getByText(/you're using 5 of 5 lists/i)).toBeInTheDocument();
      expect(screen.getByText(/upgrade to create more/i)).toBeInTheDocument();
    });

    it('shows remaining count when not at limit', () => {
      vi.mocked(countUserLists).mockReturnValue(3);
      vi.mocked(getListsRemaining).mockReturnValue(2);

      render(<UpgradeBanner {...defaultProps} />);

      expect(screen.getByText(/you're using 3 of 5 lists/i)).toBeInTheDocument();
      expect(screen.getByText(/2 remaining/i)).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onUpgradeClick when Upgrade button is clicked', async () => {
      const user = userEvent.setup();
      const onUpgradeClick = vi.fn();

      render(<UpgradeBanner {...defaultProps} onUpgradeClick={onUpgradeClick} />);

      await user.click(screen.getByRole('button', { name: /upgrade/i }));

      expect(onUpgradeClick).toHaveBeenCalledTimes(1);
    });

    it('dismisses banner and stores timestamp when X is clicked', async () => {
      const user = userEvent.setup();

      render(<UpgradeBanner {...defaultProps} />);

      // Banner should be visible
      expect(screen.getByText(/you're using/i)).toBeInTheDocument();

      // Click dismiss
      await user.click(screen.getByRole('button', { name: /dismiss/i }));

      // Banner should be hidden
      expect(screen.queryByText(/you're using/i)).not.toBeInTheDocument();

      // Check localStorage was set
      const dismissedAt = localStorage.getItem('checklist_upgrade_banner_dismissed');
      expect(dismissedAt).toBeTruthy();
      expect(parseInt(dismissedAt ?? '0', 10)).toBeGreaterThan(Date.now() - 1000);
    });
  });
});
