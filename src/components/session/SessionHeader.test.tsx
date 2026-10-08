import { render, screen } from '@testing-library/react';
import { List } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { SessionHeader } from './SessionHeader';

function renderHeader(completedIn?: string) {
  render(
    <SessionHeader
      templateName="Groceries"
      showAddForm={false}
      onToggleAddForm={vi.fn()}
      onClearOrNew={vi.fn()}
      onCycleViewMode={vi.fn()}
      getViewModeLabel={() => 'flat'}
      getViewModeIcon={() => List}
      onBack={vi.fn()}
      completedIn={completedIn}
    />,
  );
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
});
