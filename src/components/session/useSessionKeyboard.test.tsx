import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useSessionKeyboard } from './useSessionKeyboard';

interface FixtureProps {
  ids?: string[];
  enabled?: boolean;
  removeOnToggle?: boolean;
  onToggleChecked?: (id: string) => void;
  onAdd?: () => void;
  onBack?: () => void;
  withDialog?: boolean;
}

function Fixture({
  ids: initialIds = ['a', 'b', 'c'],
  enabled = true,
  removeOnToggle = false,
  onToggleChecked = () => {},
  onAdd = () => {},
  onBack = () => {},
  withDialog = false,
}: FixtureProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ids, setIds] = useState(initialIds);
  useSessionKeyboard({
    enabled,
    containerRef,
    onToggleChecked: (id) => {
      onToggleChecked(id);
      if (removeOnToggle) setIds((prev) => prev.filter((x) => x !== id));
    },
    onAdd,
    onBack,
  });
  return (
    <div>
      <input aria-label="search" />
      <p data-testid="editable" contentEditable suppressContentEditableWarning />
      <div ref={containerRef}>
        {ids.map((id) => (
          <div key={id} data-item-id={id} tabIndex={-1}>
            {id}
            <button type="button">check {id}</button>
          </div>
        ))}
      </div>
      {withDialog && (
        <div role="dialog">
          <button type="button">dialog button</button>
        </div>
      )}
    </div>
  );
}

const row = (id: string) => screen.getByText(id, { selector: '[data-item-id]' });

describe('useSessionKeyboard', () => {
  describe('arrow navigation', () => {
    it('ArrowDown with nothing focused focuses the first row', async () => {
      const user = userEvent.setup();
      render(<Fixture />);
      await user.keyboard('{ArrowDown}');
      expect(row('a')).toHaveFocus();
    });

    it('ArrowUp with nothing focused focuses the last row', async () => {
      const user = userEvent.setup();
      render(<Fixture />);
      await user.keyboard('{ArrowUp}');
      expect(row('c')).toHaveFocus();
    });

    it('moves to the next and previous rows', async () => {
      const user = userEvent.setup();
      render(<Fixture />);
      await user.keyboard('{ArrowDown}{ArrowDown}');
      expect(row('b')).toHaveFocus();
      await user.keyboard('{ArrowDown}{ArrowUp}{ArrowUp}');
      expect(row('a')).toHaveFocus();
    });

    it('stops at the ends of the list', async () => {
      const user = userEvent.setup();
      render(<Fixture />);
      await user.keyboard('{ArrowUp}{ArrowDown}');
      expect(row('c')).toHaveFocus();
      row('a').focus();
      await user.keyboard('{ArrowUp}');
      expect(row('a')).toHaveFocus();
    });

    it('moves relative to the row containing a focused button', async () => {
      const user = userEvent.setup();
      render(<Fixture />);
      screen.getByRole('button', { name: 'check b' }).focus();
      await user.keyboard('{ArrowDown}');
      expect(row('c')).toHaveFocus();
    });

    it('prevents the page from scrolling', () => {
      render(<Fixture />);
      expect(fireEvent.keyDown(document.body, { key: 'ArrowDown' })).toBe(false);
    });

    it('does nothing when there are no rows', () => {
      render(<Fixture ids={[]} />);
      expect(fireEvent.keyDown(document.body, { key: 'ArrowDown' })).toBe(true);
    });
  });

  describe('toggling the focused row', () => {
    it.each([
      ['Space', '{ }'],
      ['Enter', '{Enter}'],
    ])('%s toggles the focused row', async (_name, key) => {
      const user = userEvent.setup();
      const onToggleChecked = vi.fn();
      render(<Fixture onToggleChecked={onToggleChecked} />);
      row('b').focus();
      await user.keyboard(key);
      expect(onToggleChecked).toHaveBeenCalledExactlyOnceWith('b');
    });

    it('prevents the default action', () => {
      render(<Fixture />);
      row('a').focus();
      expect(fireEvent.keyDown(row('a'), { key: ' ' })).toBe(false);
    });

    it('does nothing when focus is not on a row', async () => {
      const user = userEvent.setup();
      const onToggleChecked = vi.fn();
      render(<Fixture onToggleChecked={onToggleChecked} />);
      await user.keyboard('{Enter}');
      screen.getByRole('button', { name: 'check a' }).focus();
      fireEvent.keyDown(document.activeElement as Element, { key: ' ' });
      expect(onToggleChecked).not.toHaveBeenCalled();
    });

    it('moves focus to the next row once the toggled row leaves', async () => {
      const user = userEvent.setup();
      render(<Fixture removeOnToggle />);
      row('a').focus();
      await user.keyboard('{ }');
      await waitFor(() => expect(row('b')).toHaveFocus());
    });

    it('moves focus to the previous row when the last row is toggled', async () => {
      const user = userEvent.setup();
      render(<Fixture removeOnToggle />);
      row('c').focus();
      await user.keyboard('{Enter}');
      await waitFor(() => expect(row('b')).toHaveFocus());
    });

    it('focuses nothing when no row remains', async () => {
      const user = userEvent.setup();
      render(<Fixture ids={['a']} removeOnToggle />);
      row('a').focus();
      await user.keyboard('{ }');
      await waitFor(() => expect(screen.queryByText('a')).not.toBeInTheDocument());
      expect(document.activeElement).toBe(document.body);
    });
  });

  describe('other keys', () => {
    it.each(['n', 'N'])('%s opens the add form', (key) => {
      const onAdd = vi.fn();
      render(<Fixture onAdd={onAdd} />);
      expect(fireEvent.keyDown(document.body, { key })).toBe(false);
      expect(onAdd).toHaveBeenCalledOnce();
    });

    it('Escape leaves the session', async () => {
      const user = userEvent.setup();
      const onBack = vi.fn();
      render(<Fixture onBack={onBack} />);
      await user.keyboard('{Escape}');
      expect(onBack).toHaveBeenCalledOnce();
    });
  });

  describe('ignored events', () => {
    it('ignores keys typed into an input', async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn();
      const onBack = vi.fn();
      render(<Fixture onAdd={onAdd} onBack={onBack} />);
      await user.click(screen.getByLabelText('search'));
      await user.keyboard('n{ArrowDown}{Escape}');
      expect(onAdd).not.toHaveBeenCalled();
      expect(onBack).not.toHaveBeenCalled();
      expect(screen.getByLabelText('search')).toHaveValue('n');
    });

    it('ignores keys in a contenteditable element', () => {
      const onAdd = vi.fn();
      render(<Fixture onAdd={onAdd} />);
      fireEvent.keyDown(screen.getByTestId('editable'), { key: 'n' });
      expect(onAdd).not.toHaveBeenCalled();
    });

    it.each(['ctrlKey', 'altKey', 'metaKey'])('ignores keys with %s held', (modifier) => {
      const onAdd = vi.fn();
      render(<Fixture onAdd={onAdd} />);
      fireEvent.keyDown(document.body, { key: 'n', [modifier]: true });
      fireEvent.keyDown(document.body, { key: 'ArrowDown', [modifier]: true });
      expect(onAdd).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(document.body);
    });

    it('ignores keys while a dialog is open', () => {
      const onBack = vi.fn();
      render(<Fixture onBack={onBack} withDialog />);
      const dialogButton = screen.getByRole('button', { name: 'dialog button' });
      fireEvent.keyDown(dialogButton, { key: 'Escape' });
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(onBack).not.toHaveBeenCalled();
    });

    it('ignores events another handler already handled', () => {
      const onBack = vi.fn();
      render(<Fixture onBack={onBack} />);
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      event.preventDefault();
      document.body.dispatchEvent(event);
      expect(onBack).not.toHaveBeenCalled();
    });

    it('does nothing while disabled', async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn();
      const onBack = vi.fn();
      render(<Fixture enabled={false} onAdd={onAdd} onBack={onBack} />);
      await user.keyboard('n{ArrowDown}{Escape}');
      expect(onAdd).not.toHaveBeenCalled();
      expect(onBack).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(document.body);
    });

    it('removes its listener on unmount', async () => {
      const user = userEvent.setup();
      const onBack = vi.fn();
      const { unmount } = render(<Fixture onBack={onBack} />);
      unmount();
      await user.keyboard('{Escape}');
      expect(onBack).not.toHaveBeenCalled();
    });
  });
});
