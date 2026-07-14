/**
 * Tests for UpgradeDialog component
 * Uses jazz-mock for CoValue mocking.
 */

import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpgradeDialog } from './UpgradeDialog';

// Mock subscription service
vi.mock('../../services/subscriptionService', () => ({
  getSubscriptionTier: vi.fn(),
  isBetaUser: vi.fn(),
  getBetaMessage: vi.fn(),
  redirectToCheckout: vi.fn(),
  TIERS: {
    free: {
      name: 'Free',
      maxListsDisplay: '3 lists',
      sessionRetentionDisplay: '7 days',
      priceDisplay: 'Free',
    },
    plus: {
      name: 'Plus',
      maxListsDisplay: '25 lists',
      sessionRetentionDisplay: '30 days',
      priceDisplay: '$4/mo',
    },
    premium: {
      name: 'Premium',
      maxListsDisplay: 'Unlimited',
      sessionRetentionDisplay: 'Unlimited',
      priceDisplay: '$8/mo',
    },
    enterprise: {
      name: 'Enterprise',
      maxListsDisplay: 'Unlimited',
      sessionRetentionDisplay: 'Unlimited',
      priceDisplay: 'Contact us',
    },
  },
}));

// The component reads the graph via useRowboat(); subscriptionService is mocked, so the graph
// value is unused — a stub is enough.
vi.mock('@/jazz', () => ({ useRowboat: () => ({}) }));

import {
  getBetaMessage,
  getSubscriptionTier,
  isBetaUser,
  redirectToCheckout,
} from '../../services/subscriptionService';

describe('UpgradeDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(getSubscriptionTier).mockReturnValue('free');
    vi.mocked(isBetaUser).mockReturnValue(false);
    vi.mocked(getBetaMessage).mockReturnValue('Beta message');
    vi.mocked(redirectToCheckout).mockResolvedValue();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders dialog when open', () => {
      render(<UpgradeDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Upgrade your plan')).toBeInTheDocument();
    });

    it('does not render when closed', () => {
      render(<UpgradeDialog {...defaultProps} open={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('displays tier comparison table with all tiers', () => {
      render(<UpgradeDialog {...defaultProps} />);

      // Tier names appear in table headers (may appear twice: once as name, once as price)
      expect(screen.getAllByText('Plus').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Premium').length).toBeGreaterThanOrEqual(1);
      // "Free" appears as both tier name and price display
      expect(screen.getAllByText('Free').length).toBeGreaterThanOrEqual(1);
    });

    it('displays features in the comparison table', () => {
      render(<UpgradeDialog {...defaultProps} />);

      expect(screen.getByText('Lists')).toBeInTheDocument();
      expect(screen.getByText('Session history')).toBeInTheDocument();
      expect(screen.getByText('Real-time sync')).toBeInTheDocument();
      expect(screen.getByText('Offline support')).toBeInTheDocument();
      expect(screen.getByText('Sharing')).toBeInTheDocument();
      expect(screen.getByText('Encrypted data')).toBeInTheDocument();
    });

    it('displays optional message when provided', () => {
      render(<UpgradeDialog {...defaultProps} message="You've hit your limit!" />);

      expect(screen.getByText("You've hit your limit!")).toBeInTheDocument();
    });

    it('displays enterprise contact section', () => {
      render(<UpgradeDialog {...defaultProps} />);

      expect(screen.getByText('Need more?')).toBeInTheDocument();
      expect(screen.getByText('Contact sales')).toBeInTheDocument();
    });
  });

  describe('tier-specific button states', () => {
    it('shows "Current" button for free tier when user is on free', () => {
      vi.mocked(getSubscriptionTier).mockReturnValue('free');

      render(<UpgradeDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /current/i })).toBeInTheDocument();
    });

    it('shows "Current plan" button for plus tier when user is on plus', () => {
      vi.mocked(getSubscriptionTier).mockReturnValue('plus');

      render(<UpgradeDialog {...defaultProps} />);

      // Should show "Current plan" for Plus
      const currentButtons = screen.getAllByRole('button', { name: /current plan/i });
      expect(currentButtons.length).toBeGreaterThan(0);
    });

    it('shows "Upgrade" buttons for plus and premium when user is on free', () => {
      vi.mocked(getSubscriptionTier).mockReturnValue('free');

      render(<UpgradeDialog {...defaultProps} />);

      const upgradeButtons = screen.getAllByRole('button', { name: /upgrade/i });
      expect(upgradeButtons.length).toBe(2);
    });

    it('shows "Coming soon" buttons during beta', () => {
      vi.mocked(getSubscriptionTier).mockReturnValue('free');
      vi.mocked(isBetaUser).mockReturnValue(true);

      render(<UpgradeDialog {...defaultProps} />);

      const comingSoonButtons = screen.getAllByRole('button', { name: /coming soon/i });
      expect(comingSoonButtons.length).toBe(2);
    });

    it('displays beta message when user is beta', () => {
      vi.mocked(isBetaUser).mockReturnValue(true);
      vi.mocked(getBetaMessage).mockReturnValue('Beta users get Premium features for free!');

      render(<UpgradeDialog {...defaultProps} />);

      expect(screen.getByText('Beta users get Premium features for free!')).toBeInTheDocument();
    });
  });

  describe('upgrade interactions', () => {
    it('calls redirectToCheckout with "plus" when Plus upgrade is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(getSubscriptionTier).mockReturnValue('free');

      render(<UpgradeDialog {...defaultProps} />);

      const upgradeButtons = screen.getAllByRole('button', { name: /upgrade/i });
      // First upgrade button is for Plus
      await user.click(upgradeButtons[0]);

      expect(redirectToCheckout).toHaveBeenCalledWith('plus');
    });

    it('calls redirectToCheckout with "premium" when Premium upgrade is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(getSubscriptionTier).mockReturnValue('free');

      render(<UpgradeDialog {...defaultProps} />);

      const upgradeButtons = screen.getAllByRole('button', { name: /upgrade/i });
      // Second upgrade button is for Premium
      await user.click(upgradeButtons[1]);

      expect(redirectToCheckout).toHaveBeenCalledWith('premium');
    });

    it('does not call redirectToCheckout for beta users', async () => {
      const user = userEvent.setup();
      vi.mocked(getSubscriptionTier).mockReturnValue('free');
      vi.mocked(isBetaUser).mockReturnValue(true);

      render(<UpgradeDialog {...defaultProps} />);

      // Beta users see disabled "Coming soon" buttons
      const comingSoonButtons = screen.getAllByRole('button', { name: /coming soon/i });
      await user.click(comingSoonButtons[0]);

      expect(redirectToCheckout).not.toHaveBeenCalled();
    });
  });

  describe('dialog interactions', () => {
    it('calls onOpenChange when close button is clicked', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      render(<UpgradeDialog {...defaultProps} onOpenChange={onOpenChange} />);

      await user.click(screen.getByRole('button', { name: /close/i }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
