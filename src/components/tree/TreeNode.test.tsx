import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TreeNode } from './TreeNode';

describe('TreeNode', () => {
  it('should render children content', () => {
    render(
      <TreeNode level={0} expanded={false} onToggleExpand={() => {}} hasChildren={false}>
        <span>Test Content</span>
      </TreeNode>,
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('should apply correct indentation based on level', () => {
    const { container } = render(
      <TreeNode level={2} expanded={false} onToggleExpand={() => {}} hasChildren={false}>
        <span>Content</span>
      </TreeNode>,
    );

    const nodeDiv = container.querySelector('div');
    expect(nodeDiv).toHaveStyle({ paddingLeft: '40px' }); // 2 * 20px
  });

  it('should show expand button when hasChildren is true', () => {
    render(
      <TreeNode level={0} expanded={false} onToggleExpand={() => {}} hasChildren={true}>
        <span>Content</span>
      </TreeNode>,
    );

    const expandButton = screen.getByLabelText('Expand');
    expect(expandButton).toBeInTheDocument();
  });

  it('should show collapse button when expanded', () => {
    render(
      <TreeNode level={0} expanded={true} onToggleExpand={() => {}} hasChildren={true}>
        <span>Content</span>
      </TreeNode>,
    );

    const collapseButton = screen.getByLabelText('Collapse');
    expect(collapseButton).toBeInTheDocument();
  });

  it('should not show expand/collapse button when hasChildren is false', () => {
    render(
      <TreeNode level={0} expanded={false} onToggleExpand={() => {}} hasChildren={false}>
        <span>Content</span>
      </TreeNode>,
    );

    expect(screen.queryByLabelText('Expand')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Collapse')).not.toBeInTheDocument();
  });

  it('should call onToggleExpand when expand button is clicked', async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();

    render(
      <TreeNode level={0} expanded={false} onToggleExpand={onToggleExpand} hasChildren={true}>
        <span>Content</span>
      </TreeNode>,
    );

    const expandButton = screen.getByLabelText('Expand');
    await user.click(expandButton);

    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it('should apply custom className', () => {
    const { container } = render(
      <TreeNode
        level={0}
        expanded={false}
        onToggleExpand={() => {}}
        hasChildren={false}
        className="custom-class"
      >
        <span>Content</span>
      </TreeNode>,
    );

    const nodeDiv = container.querySelector('.custom-class');
    expect(nodeDiv).toBeInTheDocument();
  });
});
