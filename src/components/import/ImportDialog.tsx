import type { InstanceOfSchema } from 'jazz-tools';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import { FileUploadDialog } from '@/components/ui/file-upload-dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import type { Account, FolderNode } from '@/schemas';
import { ImportService } from '@/services/import/importService';
import type { CsvImportResult } from '@/services/import/csvImporter';
import type { TxtImportResult } from '@/services/import/txtImporter';
import type { ImportResult } from '@/services/import/types';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: InstanceOfSchema<typeof Account>;
  /** Optional folder for folder-level import */
  folder?: InstanceOfSchema<typeof FolderNode>;
  onImportComplete?: () => void;
}

type UnifiedImportResult = ImportResult | TxtImportResult | CsvImportResult;

export function ImportDialog({ open, onOpenChange, account, folder, onImportComplete }: ImportDialogProps) {
  const [fileType, setFileType] = useState<'json' | 'txt' | 'csv' | null>(null);
  const [templateName, setTemplateName] = useState('');

  const isTemplate = folder?.type === 'template-folder';
  const isFolderLevel = !!folder;

  const handleUpload = async (file: File, detectedType: 'json' | 'txt' | 'csv') => {
    setFileType(detectedType);

    let result: UnifiedImportResult;

    // Folder-level import
    if (folder && isTemplate) {
      // Template folder: JSON (items) or TXT/CSV (append items)
      if (detectedType === 'json') {
        // TODO: Import JSON items list - for now use TXT/CSV logic
        result = await ImportService.importItemsFromCsvFile(file, folder, account);
      } else if (detectedType === 'txt') {
        result = await ImportService.importItemsFromTxtFile(file, folder, account);
      } else {
        result = await ImportService.importItemsFromCsvFile(file, folder, account);
      }

      // Auto-close after successful import
      if ('imported' in result && result.imported > 0) {
        setTimeout(() => {
          onImportComplete?.();
          onOpenChange(false);
          setFileType(null);
          setTemplateName('');
        }, 2000);
      }
    } else if (folder) {
      // Organizational folder: JSON only
      if (detectedType !== 'json') {
        throw new Error('Only JSON files are supported for folder import');
      }
      result = await ImportService.importFromFile(file, account, 'json');

      if ('success' in result && result.success) {
        setTimeout(() => {
          onImportComplete?.();
          onOpenChange(false);
          setFileType(null);
          setTemplateName('');
        }, 2000);
      }
    } else {
      // Top-level import
      if (detectedType === 'json') {
        // Full account import
        result = await ImportService.importFromFile(file, account, 'json');
      } else {
        // Create new template at root
        if (!templateName.trim()) {
          throw new Error('Please enter a list name');
        }
        result = await ImportService.importAsNewTemplate(
          file,
          account,
          templateName.trim(),
          detectedType,
        );
      }

      if ('success' in result && result.success) {
        setTimeout(() => {
          onImportComplete?.();
          onOpenChange(false);
          setFileType(null);
          setTemplateName('');
        }, 2000);
      }
    }

    return result;
  };

  const renderResult = (result: UnifiedImportResult) => {
    // Handle TXT/CSV import result (for template items)
    if ('imported' in result) {
      const hasSuccess = result.imported > 0;
      const hasErrors = result.errors.length > 0;

      return (
        <output
          aria-live="polite"
          aria-atomic="true"
          className={`rounded-lg border p-4 ${
            hasSuccess && !hasErrors
              ? 'border-green-200 bg-green-50'
              : hasErrors
                ? 'border-red-200 bg-red-50'
                : 'border-amber-200 bg-amber-50'
          }`}
        >
          <div className="flex items-start gap-3">
            {hasSuccess && !hasErrors ? (
              <CheckCircle className="h-5 w-5 text-green-600" aria-hidden="true" />
            ) : (
              <AlertCircle className={`h-5 w-5 ${hasErrors ? 'text-red-600' : 'text-amber-600'}`} aria-hidden="true" />
            )}
            <div className="flex-1">
              <div
                className={`font-medium ${
                  hasSuccess && !hasErrors
                    ? 'text-green-900'
                    : hasErrors
                      ? 'text-red-900'
                      : 'text-amber-900'
                }`}
              >
                {hasSuccess && !hasErrors
                  ? 'Import Successful!'
                  : hasErrors
                    ? 'Import Completed with Errors'
                    : 'Import Completed'}
              </div>

              <div className="mt-2 space-y-1 text-sm">
                {result.imported > 0 && (
                  <div className="text-green-800">• {result.imported} item(s) imported</div>
                )}
                {result.skipped > 0 && (
                  <div className="text-amber-800">• {result.skipped} item(s) skipped (duplicates)</div>
                )}
              </div>

              {result.duplicates && result.duplicates.length > 0 && (
                <div className="mt-3 text-sm">
                  <div className="font-medium text-amber-900">Skipped duplicates:</div>
                  <ul className="ml-4 mt-1 max-h-32 list-disc overflow-y-auto text-amber-800">
                    {result.duplicates.slice(0, 10).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                    {result.duplicates.length > 10 && (
                      <li>...and {result.duplicates.length - 10} more</li>
                    )}
                  </ul>
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="mt-2 text-sm">
                  <div className="font-medium text-red-900">Errors:</div>
                  <ul className="ml-4 mt-1 list-disc text-red-800">
                    {result.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </output>
      );
    }

    // Handle JSON import result
    return (
      <output
        aria-live="polite"
        aria-atomic="true"
        className={`rounded-lg border p-4 ${
          result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
        }`}
      >
        <div className="flex items-start gap-3">
          {result.success ? (
            <CheckCircle className="h-5 w-5 text-green-600" aria-hidden="true" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
          )}
          <div className="flex-1">
            <div className={`font-medium ${result.success ? 'text-green-900' : 'text-red-900'}`}>
              {result.success ? 'Import Successful!' : 'Import Failed'}
            </div>

            {result.success && result.stats && (
              <div className="mt-2 space-y-1 text-sm text-green-800">
                {result.stats.foldersCreated !== undefined && (
                  <div>• {result.stats.foldersCreated} folder(s) imported</div>
                )}
                {result.stats.itemsAdded !== undefined && (
                  <div>• {result.stats.itemsAdded} item(s) added</div>
                )}
                {result.stats.sessionsCreated !== undefined && (
                  <div>• {result.stats.sessionsCreated} session(s) created</div>
                )}
              </div>
            )}

            {result.warnings && result.warnings.length > 0 && (
              <div className="mt-3 text-sm">
                <div className="font-medium text-amber-900">Warnings:</div>
                <ul className="ml-4 mt-1 list-disc text-amber-800">
                  {result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.errors && result.errors.length > 0 && (
              <div className="mt-2 text-sm">
                <ul className="ml-4 list-disc text-red-800">
                  {result.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </output>
    );
  };

  // Dynamic dialog configuration based on context
  const getDialogConfig = () => {
    if (folder && isTemplate) {
      return {
        title: `Import Items: ${folder.name}`,
        description: 'Auto-detects JSON (items list) or TXT/CSV (append items).',
        acceptedFileTypes: ['json', 'txt', 'csv'] as ('json' | 'txt' | 'csv')[],
        infoContent: (
          <>
            <div className="font-medium">Import rules:</div>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li>Items will be appended to existing list</li>
              <li>Duplicate items (by name) will be skipped</li>
              <li>Auto-categorized if category not provided</li>
            </ul>
            <div className="mt-3">
              <a
                href="/help/imports.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 underline text-sm"
              >
                Learn more about import formats
              </a>
            </div>
          </>
        ),
      };
    }

    if (folder) {
      return {
        title: `Import Folder: ${folder.name}`,
        description: 'Import folder structure from JSON backup.',
        acceptedFileTypes: ['json'] as ('json' | 'txt' | 'csv')[],
        infoContent: (
          <>
            <div className="font-medium">Import rules:</div>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li>Duplicate folders renamed with numbered suffix</li>
              <li>Existing data will never be overwritten</li>
            </ul>
            <div className="mt-3">
              <a
                href="/help/imports.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 underline text-sm"
              >
                Learn more about import formats
              </a>
            </div>
          </>
        ),
      };
    }

    return {
      title: 'Import',
      description: 'Auto-detects JSON (full backup) or TXT/CSV (create new list).',
      acceptedFileTypes: ['json', 'txt', 'csv'] as ('json' | 'txt' | 'csv')[],
      infoContent: (
        <>
          <div className="font-medium">Import rules:</div>
          <ul className="ml-4 mt-2 list-disc space-y-1">
            <li>Duplicate folders renamed with numbered suffix (1), (2), (3)...</li>
            <li>Items auto-categorized if category not provided</li>
            <li>Existing data will never be overwritten</li>
          </ul>
          <div className="mt-3">
            <a
              href="/help/imports.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 underline text-sm"
            >
              Learn more about import formats
            </a>
          </div>
        </>
      ),
    };
  };

  const config = getDialogConfig();

  return (
    <FileUploadDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setFileType(null);
          setTemplateName('');
        }
        onOpenChange(isOpen);
      }}
      title={config.title}
      description={config.description}
      acceptedFileTypes={config.acceptedFileTypes}
      maxSizeMB={10}
      onUpload={handleUpload}
      renderResult={renderResult}
      uploadButtonText="Import"
      canUpload={(file) => {
        if (!file) return false;
        // For folder-level or JSON, always allow
        if (isFolderLevel || fileType === 'json') return true;
        // For top-level TXT/CSV, require template name
        return templateName.trim().length > 0;
      }}
      formFields={(file, result) => {
        // Auto-detect file type and generate template name
        if (file && !fileType) {
          const fileName = file.name.toLowerCase();
          let detectedType: 'json' | 'txt' | 'csv';
          if (fileName.endsWith('.json')) {
            detectedType = 'json';
          } else if (fileName.endsWith('.csv')) {
            detectedType = 'csv';
          } else {
            detectedType = 'txt';
          }
          setFileType(detectedType);

          // Auto-generate template name from filename (for TXT/CSV at top level)
          if (!isFolderLevel && detectedType !== 'json' && !templateName) {
            const baseName = file.name.replace(/\.(txt|csv)$/i, '');
            setTemplateName(baseName);
          }
        }

        // Show template name input only for top-level TXT/CSV and when no result
        return file && !isFolderLevel && fileType !== 'json' && !result ? (
          <FormField label="List name" htmlFor="template-name" required>
            <Input
              id="template-name"
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Enter list name..."
            />
          </FormField>
        ) : null;
      }}
      infoContent={config.infoContent}
    />
  );
}
