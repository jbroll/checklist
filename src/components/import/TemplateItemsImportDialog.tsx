import type { InstanceOfSchema } from 'jazz-tools';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { FileUploadDialog } from '@/components/ui/file-upload-dialog';
import type { Account, FolderNode } from '@/schemas';
import type { CsvImportResult } from '@/services/import/csvImporter';
import { ImportService } from '@/services/import/importService';
import type { TxtImportResult } from '@/services/import/txtImporter';

interface TemplateItemsImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: InstanceOfSchema<typeof FolderNode>;
  account: InstanceOfSchema<typeof Account>;
  onImportComplete?: () => void;
}

type ImportResult = TxtImportResult | CsvImportResult;

export function TemplateItemsImportDialog({
  open,
  onOpenChange,
  folder,
  account,
  onImportComplete,
}: TemplateItemsImportDialogProps) {
  const handleUpload = async (file: File, fileType: 'txt' | 'csv' | 'json') => {
    if (fileType === 'json') {
      throw new Error('JSON files are not supported for template items import');
    }

    let result: ImportResult;

    if (fileType === 'txt') {
      result = await ImportService.importItemsFromTxtFile(file, folder, account);
    } else {
      result = await ImportService.importItemsFromCsvFile(file, folder, account);
    }

    // Auto-close after successful import
    if (result.imported > 0) {
      setTimeout(() => {
        onImportComplete?.();
        onOpenChange(false);
      }, 2000);
    }

    return result;
  };

  const renderResult = (result: ImportResult) => {
    const hasSuccess = result.imported > 0;
    const hasErrors = result.errors.length > 0;

    return (
      <div
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
            <CheckCircle className="h-5 w-5 text-green-600" />
          ) : (
            <AlertCircle className={`h-5 w-5 ${hasErrors ? 'text-red-600' : 'text-amber-600'}`} />
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
                <div className="text-amber-800">
                  • {result.skipped} item(s) skipped (duplicates)
                </div>
              )}
            </div>

            {result.duplicates.length > 0 && (
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
      </div>
    );
  };

  return (
    <FileUploadDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import List Items"
      description={`Import items into ${folder.name} from a TXT or CSV file.`}
      acceptedFileTypes={['txt', 'csv']}
      maxSizeMB={10}
      onUpload={handleUpload}
      renderResult={renderResult}
      uploadButtonText="Import Items"
      infoContent={
        <>
          <div className="font-medium">File format:</div>
          <ul className="ml-4 mt-2 list-disc space-y-1">
            <li>
              <strong>TXT:</strong> One item name per line
            </li>
            <li>
              <strong>CSV:</strong> Columns: name, category, sortOrder, defaultQuantity
            </li>
          </ul>
          <div className="mt-3 font-medium">Import rules:</div>
          <ul className="ml-4 mt-2 list-disc space-y-1">
            <li>Items will be auto-categorized if category not provided</li>
            <li>Duplicate items (by name) will be skipped</li>
            <li>Existing list items will never be overwritten</li>
          </ul>
        </>
      }
    />
  );
}
