/**
 * Main import service (rowboat port, slice-2)
 *
 * Orchestrates all import operations (JSON, TXT, CSV).
 *
 * NOTE (scope): session-CSV import (`sessionImporter.ts` in the pre-port app) is NOT ported —
 * it was never wired into `ImportDialog`/`useImportDialog` even before the port (dead code), so
 * there is no behavior regression. Folder-tree JSON import here only creates NEW template
 * folders (matching `../export/jsonExporter.ts`'s flat `ExportedData.folders` shape — the export
 * format never nests organizational folders, so import doesn't need to either).
 */

import type { RelationalGraph } from '@jbroll/rowboat-schema';
import type { schema } from '../../schema/folder';
import { readFileAsText } from '../../utils/fileUpload';
import * as folderOps from '../folderOps';
import { type CsvImportResult, importItemsFromCsv } from './csvImporter';
import { MAX_FILE_SIZE_MB, validateImportFile } from './importValidator';
import { importItemsFromJson, importJson, type JsonImportContext } from './jsonImporter';
import { createErrorResult, createSuccessResult } from './resultHelpers';
import { importItemsFromText, parseTextMetadata, type TxtImportResult } from './txtImporter';
import type { ImportFileType, ImportResult } from './types';

type Graph = RelationalGraph<typeof schema>;

/**
 * Result of validating and reading a file
 */
type FileReadResult = { success: true; content: string } | { success: false; error: string };

/**
 * Validate and read a file, returning content or error
 */
async function validateAndReadFile(file: File, extensions: string[]): Promise<FileReadResult> {
  try {
    validateImportFile(file, extensions, MAX_FILE_SIZE_MB);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Validation failed',
    };
  }

  try {
    const content = await readFileAsText(file);
    return { success: true, content };
  } catch (error) {
    return {
      success: false,
      error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Detect file type from filename
 */
function detectFileType(file: File): ImportFileType | null {
  const filename = file.name.toLowerCase();

  if (filename.endsWith('.json')) return 'json';
  if (filename.endsWith('.txt')) return 'txt';
  if (filename.endsWith('.csv')) return 'csv';

  return null;
}

/**
 * Get valid file extensions for a file type
 */
function getValidExtensions(fileType: ImportFileType): string[] {
  switch (fileType) {
    case 'json':
      return ['json'];
    case 'txt':
      return ['txt'];
    case 'csv':
      return ['csv'];
    default:
      return [];
  }
}

/**
 * Import a full/partial JSON backup from a file.
 *
 * @param g - The rowboat graph
 * @param file - File object from input or drag-and-drop
 * @param ctx - group-minting + attribution context (see `jsonImporter.JsonImportContext`)
 * @param fileType - Expected file type (optional, auto-detected from extension)
 * @returns Import result with success/failure info
 */
export async function importFromFile(
  g: Graph,
  file: File,
  ctx: JsonImportContext,
  fileType?: ImportFileType,
): Promise<ImportResult> {
  const detectedType = fileType || detectFileType(file);
  if (!detectedType) {
    return createErrorResult('Unable to determine file type. Expected .json, .txt, or .csv');
  }

  const validExtensions = getValidExtensions(detectedType);
  try {
    validateImportFile(file, validExtensions, MAX_FILE_SIZE_MB);
  } catch (error) {
    return createErrorResult(error instanceof Error ? error : 'Validation failed');
  }

  let content: string;
  try {
    content = await readFileAsText(file);
  } catch (error) {
    return createErrorResult(
      `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

  switch (detectedType) {
    case 'json':
      return await importJson(g, content, ctx);
    case 'txt':
      return createErrorResult('Use importAsNewTemplate() for TXT files');
    case 'csv':
      return createErrorResult('Use importAsNewTemplate() for CSV files');
    default:
      return createErrorResult(`Unsupported file type: ${detectedType}`);
  }
}

/** Import template items from a TXT file into an existing template. */
export async function importItemsFromTxtFile(
  g: Graph,
  templateId: string,
  file: File,
): Promise<TxtImportResult> {
  const result = await validateAndReadFile(file, ['txt']);
  if (!result.success) {
    return { imported: 0, skipped: 0, errors: [result.error], duplicates: [], metadata: {} };
  }
  return importItemsFromText(g, templateId, result.content);
}

/** Import template items from a JSON file into an existing template. */
export async function importItemsFromJsonFile(
  g: Graph,
  templateId: string,
  file: File,
): Promise<CsvImportResult> {
  const result = await validateAndReadFile(file, ['json']);
  if (!result.success) {
    return { imported: 0, skipped: 0, errors: [result.error], duplicates: [] };
  }
  return importItemsFromJson(g, templateId, result.content);
}

/** Import template items from a CSV file into an existing template. */
export async function importItemsFromCsvFile(
  g: Graph,
  templateId: string,
  file: File,
): Promise<CsvImportResult> {
  const result = await validateAndReadFile(file, ['csv']);
  if (!result.success) {
    return { imported: 0, skipped: 0, errors: [result.error], duplicates: [] };
  }
  return importItemsFromCsv(g, templateId, result.content);
}

export interface ImportAsNewTemplateOptions {
  /** Enable auto-categorization for the new template */
  autoCategorize?: boolean;
}

/**
 * Import a TXT/CSV file as a brand-new template folder.
 *
 * Creates a new template with the given name and imports all items into it. For TXT files, if
 * the file contains a `# name:` metadata comment, it is used as the template name (unless
 * overridden by `templateName`).
 */
export async function importAsNewTemplate(
  g: Graph,
  file: File,
  templateName: string | undefined,
  fileType: 'txt' | 'csv',
  ctx: JsonImportContext,
  options: ImportAsNewTemplateOptions = {},
): Promise<ImportResult> {
  const result = await validateAndReadFile(file, [fileType]);
  if (!result.success) {
    return { success: false, errors: [result.error], warnings: [], stats: {} };
  }
  const content = result.content;

  let finalTemplateName = templateName;

  if (fileType === 'txt' && !finalTemplateName) {
    const metadata = parseTextMetadata(content);
    if (metadata.name) {
      finalTemplateName = metadata.name;
    }
  }

  if (!finalTemplateName) {
    finalTemplateName = file.name.replace(/\.(txt|csv)$/i, '');
  }

  const parentId = ctx.parentId ?? null;
  const parentGroupId = parentId ? folderOps.findById(g, parentId)?.owner_group_id : undefined;
  const ownerGroupId = await ctx.mintGroup(parentGroupId);
  const now = Date.now();
  const newTemplate = await folderOps.addFolder(g, {
    id: crypto.randomUUID(),
    name: folderOps.generateUniqueName(g, finalTemplateName, parentId),
    parentId,
    type: 'template-folder',
    ownerGroupId,
    createdBy: ctx.createdBy,
    now,
  });

  if (options.autoCategorize) {
    await g.folder.update(newTemplate.id, { auto_categorize_enabled: true });
  }

  const importResult =
    fileType === 'txt'
      ? await importItemsFromText(g, newTemplate.id, content)
      : await importItemsFromCsv(g, newTemplate.id, content);

  // Check if import succeeded - if not, clean up the empty template we created.
  if (importResult.errors.length > 0 && importResult.imported === 0) {
    await folderOps.deleteNode(g, newTemplate.id);
    return createErrorResult(importResult.errors[0]);
  }

  // Set all imported items as default items so they're selected when opening the list.
  const created = folderOps.findById(g, newTemplate.id);
  if (created && created.items.length > 0) {
    const defaultItems: Record<string, boolean> = {};
    for (const item of created.items) {
      if (item.type === 'item' && !item.archived) {
        defaultItems[item.id] = true;
      }
    }
    if (Object.keys(defaultItems).length > 0) {
      await g.folder.update(newTemplate.id, { default_items: defaultItems });
    }
  }

  return createSuccessResult(
    {
      foldersCreated: 1,
      itemsAdded: importResult.imported,
      itemsSkipped: importResult.skipped,
    },
    importResult.duplicates.length > 0 ? ['Some duplicate items were skipped'] : [],
  );
}
