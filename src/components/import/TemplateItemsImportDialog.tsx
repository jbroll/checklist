import type { InstanceOfSchema } from 'jazz-tools';
import { AlertCircle, CheckCircle, Upload } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { FolderNode, GroceriesAccount } from '@/schemas';
import type { CsvImportResult } from '@/services/import/csvImporter';
import { ImportService } from '@/services/import/importService';
import type { TxtImportResult } from '@/services/import/txtImporter';
import { isValidFileSize, isValidFileType } from '@/utils/fileUpload';

interface TemplateItemsImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: InstanceOfSchema<typeof FolderNode>;
  account: InstanceOfSchema<typeof GroceriesAccount>;
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [fileType, setFileType] = useState<'txt' | 'csv' | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const validateAndSetFile = (file: File) => {
    // Validate file type
    if (!isValidFileType(file, ['txt', 'csv'])) {
      alert('Please select a TXT or CSV file (.txt or .csv)');
      return;
    }

    // Validate file size (10MB max)
    if (!isValidFileSize(file, 10)) {
      alert('File size exceeds 10MB limit');
      return;
    }

    // Determine file type from extension
    const detectedType = file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'txt';
    setFileType(detectedType);
    setSelectedFile(file);
    setImportResult(null);
  };

  const handleImport = async () => {
    if (!selectedFile || !fileType) return;

    setIsImporting(true);
    setImportResult(null);

    try {
      let result: ImportResult;

      if (fileType === 'txt') {
        result = await ImportService.importItemsFromTxtFile(selectedFile, folder, account);
      } else {
        result = await ImportService.importItemsFromCsvFile(selectedFile, folder, account);
      }

      setImportResult(result);

      // Auto-close after successful import
      if (result.imported > 0) {
        setTimeout(() => {
          onImportComplete?.();
          onOpenChange(false);
          handleReset();
        }, 2000);
      }
    } catch (error) {
      setImportResult({
        imported: 0,
        skipped: 0,
        errors: [`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        duplicates: [],
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setFileType(null);
    setImportResult(null);
    setIsDragging(false);
  };

  const handleCancel = () => {
    handleReset();
    onOpenChange(false);
  };

  const hasSuccess = importResult && importResult.imported > 0;
  const hasErrors = importResult && importResult.errors.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Import List Items</DialogTitle>
          <DialogDescription>
            Import items into {folder.name} from a TXT or CSV file.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* File upload area */}
          {!selectedFile && (
            // biome-ignore lint/a11y/useSemanticElements: Drag-drop zone, not a clickable button
            <div
              role="button"
              tabIndex={0}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                isDragging ? 'border-green-500 bg-green-50' : 'border-neutral-300 bg-neutral-50'
              }`}
            >
              <Upload
                className={`mb-3 h-12 w-12 ${isDragging ? 'text-green-600' : 'text-neutral-400'}`}
              />
              <p className="mb-2 text-sm font-medium text-neutral-700">
                {isDragging ? 'Drop file here' : 'Drop TXT or CSV file here or'}
              </p>
              <label
                htmlFor="file-upload"
                className="cursor-pointer rounded-md bg-white px-3 py-2 text-sm font-medium text-green-600 hover:bg-green-50"
              >
                Browse Files
              </label>
              <input
                id="file-upload"
                type="file"
                accept=".txt,.csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              <p className="mt-2 text-xs text-neutral-500">TXT or CSV files only, up to 10MB</p>
            </div>
          )}

          {/* Selected file info */}
          {selectedFile && !importResult && (
            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-neutral-900">{selectedFile.name}</div>
                  <div className="text-sm text-neutral-600">
                    {(selectedFile.size / 1024).toFixed(1)} KB • {fileType?.toUpperCase()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-sm text-neutral-500 hover:text-neutral-700"
                >
                  Change
                </button>
              </div>
            </div>
          )}

          {/* Import result */}
          {importResult && (
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
                  <AlertCircle
                    className={`h-5 w-5 ${hasErrors ? 'text-red-600' : 'text-amber-600'}`}
                  />
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

                  {/* Success stats */}
                  <div className="mt-2 space-y-1 text-sm">
                    {importResult.imported > 0 && (
                      <div className="text-green-800">
                        • {importResult.imported} item(s) imported
                      </div>
                    )}
                    {importResult.skipped > 0 && (
                      <div className="text-amber-800">
                        • {importResult.skipped} item(s) skipped (duplicates)
                      </div>
                    )}
                  </div>

                  {/* Duplicates list */}
                  {importResult.duplicates.length > 0 && (
                    <div className="mt-3 text-sm">
                      <div className="font-medium text-amber-900">Skipped duplicates:</div>
                      <ul className="ml-4 mt-1 max-h-32 list-disc overflow-y-auto text-amber-800">
                        {importResult.duplicates.slice(0, 10).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                        {importResult.duplicates.length > 10 && (
                          <li>...and {importResult.duplicates.length - 10} more</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {/* Errors */}
                  {importResult.errors.length > 0 && (
                    <div className="mt-2 text-sm">
                      <div className="font-medium text-red-900">Errors:</div>
                      <ul className="ml-4 mt-1 list-disc text-red-800">
                        {importResult.errors.map((error) => (
                          <li key={error}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Info box */}
          {!importResult && (
            <div className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
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
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" onClick={handleCancel} disabled={isImporting} variant="secondary">
            {importResult ? 'Close' : 'Cancel'}
          </Button>
          {!importResult && (
            <Button
              type="button"
              onClick={handleImport}
              disabled={!selectedFile || isImporting}
              variant="primary"
            >
              <Upload className="h-4 w-4" />
              {isImporting ? 'Importing...' : 'Import Items'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
