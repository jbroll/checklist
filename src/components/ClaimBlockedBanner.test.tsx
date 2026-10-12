import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClaimBlockedBanner } from './ClaimBlockedBanner';

describe('ClaimBlockedBanner', () => {
  it('says another tab holds the signed-out lists and retries on click', () => {
    const onRetry = vi.fn();
    render(<ClaimBlockedBanner onRetry={onRetry} />);
    expect(screen.getByRole('alert').textContent).toContain('still open in another CheckList tab');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
