/**
 * Folder - rowboat rb.* table for the CheckList folder/template hierarchy.
 *
 * Replaces the Jazz `FolderNode` CoValue (see `./tree.ts`, kept for now — other code
 * still imports it). This table only carries the *hierarchy* row shape; items/sessions
 * for template folders are ported in a later slice.
 */
import { createRowboat } from '@jbroll/rowboat-react';
import { type RowOf, rb } from '@jbroll/rowboat-schema';
import { z } from 'zod';

export const Folder = z.object({
  id: rb.id(),
  owner_group_id: rb.scope(),
  name: rb.text(),
  type: rb.text(),
  parent_id: rb.parent('folder'),
  sharing_mode: rb.text(),
  archived: rb.bool(),
  expanded: rb.bool(),
  created_by: rb.text(),
  created_at: rb.int(),
  updated_at: rb.int(),
});

export const schema = { folder: Folder };

export type FolderRow = RowOf<typeof Folder>;

export const { RowboatProvider, useRowboat, useSelect } = createRowboat(schema);
