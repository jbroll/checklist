import { render, screen } from '@testing-library/react';
import { List } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { SessionHeader } from './SessionHeader';

function renderHeader(
  completedIn?: string,
  sortMode: 'manual' | 'ascending' | 'descending' = 'manual',
) {
  const onToggleSortMode = vi.fn();
  render(
    <SessionHeader
      templateName="Groceries"
      showAddForm={false}
      onToggleAddForm={vi.fn()}
      onClearOrNew={vi.fn()}
      onCycleViewMode={vi.fn()}
      getViewModeLabel={() => 'flat'}
      getViewModeIcon={() => List}
      sortMode={sortMode}
      onToggleSortMode={onToggleSortMode}
      onBack={vi.fn()}
      completedIn={completedIn}
    />,
  );
  return { onToggleSortMode };
}

describe('SessionHeader', () => {
  it('shows how long the session took when given', () => {
    renderHeader('1 h 5 min');
    expect(screen.getByText('Completed in 1 h 5 min')).toBeInTheDocument();
  });

  it('shows no completion line otherwise', () => {
    renderHeader();
    expect(screen.queryByText(/Completed in/)).not.toBeInTheDocument();
  });

  it('shows the sort toggle and calls back when clicked', async () => {
    const { onToggleSortMode } = renderHeader(undefined, 'manual');
    const toggle = screen.getByRole('button', { name: /switch to A-Z order/i });
    expect(toggle).toBeVisible();
    await toggle.click();
    expect(onToggleSortMode).toHaveBeenCalledTimes(1);
  });

  it('shows the Z-A toggle when sorting ascending', () => {
    renderHeader(undefined, 'ascending');
    expect(screen.getByRole('button', { name: /switch to Z-A order/i })).toBeVisible();
  });

  it('shows the manual-order toggle when sorting descending', () => {
    renderHeader(undefined, 'descending');
    expect(screen.getByRole('button', { name: /switch to manual order/i })).toBeVisible();
  });
});
