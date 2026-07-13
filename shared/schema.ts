/**
 * Folder - rowboat rb.* table for the CheckList folder/template hierarchy.
 *
 * Lives at the repo root (not under `src/` or `backend/src/`) because both the frontend
 * (`src/schema/folder.ts`) and the backend host (`backend/src/index.ts`) need the exact same
 * table definition, and each package's `tsconfig.json` rootDir/include only covers its own
 * tree. A shared root-level module keeps ONE definition instead of two definitions that could
 * drift (a schema mismatch between client and server manifests is exactly the kind of bug NO
 * FALLBACKS forbids papering over).
 *
 * This table only carries the *hierarchy* row shape; items/sessions for template folders are
 * ported in a later slice.
 */
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
