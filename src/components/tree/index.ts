export { FolderNodeView } from './FolderNodeView';
export { IndentedRow } from './IndentedRow';
// TODO(slice-2): SessionRowView/TemplateItemView are items/session UI, unused by the
// folders-only TreeView in this slice; left unexported here to avoid dragging their Jazz
// CoValue props into the barrel's type surface. The files themselves are untouched.
export {
  TreeView,
  type TreeViewArchiveSettings,
  type TreeViewAuthProps,
  type TreeViewHeaderActions,
  type TreeViewSelectionHandlers,
} from './TreeView';
