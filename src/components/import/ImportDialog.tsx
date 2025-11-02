import type { InstanceOfSchema } from 'jazz-tools';
import { AlertCircle, CheckCircle, Upload } from 'lucide-react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { GroceriesAccount } from '@/schemas';
import { ImportService } from '@/services/import/importService';
import type { ImportResult } from '@/services/import/types';
import { isValidFileSize, isValidFileType } from '@/utils/fileUpload';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: InstanceOfSchema<typeof GroceriesAccount>;
  onImportComplete?: () => void;
}

export function ImportDialog({ open, onOpenChange, account, onImportComplete }: ImportDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

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
    if (!isValidFileType(file, ['json'])) {
      alert('Please select a JSON file (.json)');
      return;
    }

    // Validate file size (10MB max)
    if (!isValidFileSize(file, 10)) {
      alert('File size exceeds 10MB limit');
      return;
    }

    setSelectedFile(file);
    setImportResult(null);
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setIsImporting(true);
    setImportResult(null);

    try {
      const result = await ImportService.importFromFile(selectedFile, account, 'json');
      setImportResult(result);

      if (result.success) {
        // Auto-close after successful import
        setTimeout(() => {
          onImportComplete?.();
          onOpenChange(false);
          handleReset();
        }, 2000);
      }
    } catch (error) {
      setImportResult({
        success: false,
        errors: [`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        stats: {},
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setImportResult(null);
    setIsDragging(false);
  };

  const handleCancel = () => {
    handleReset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Import Grocery Data</DialogTitle>
          <DialogDescription>
            Import folders, items, and sessions from a JSON export file.
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
                {isDragging ? 'Drop file here' : 'Drop JSON file here or'}
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
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
              />
              <p className="mt-2 text-xs text-neutral-500">JSON files only, up to 10MB</p>
            </div>
          )}

          {/* Selected file info */}
          {selectedFile && !importResult && (
            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-neutral-900">{selectedFile.name}</div>
                  <div className="text-sm text-neutral-600">
                    {(selectedFile.size / 1024).toFixed(1)} KB
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
                importResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
              }`}
            >
              <div className="flex items-start gap-3">
                {importResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                )}
                <div className="flex-1">
                  <div
                    className={`font-medium ${importResult.success ? 'text-green-900' : 'text-red-900'}`}
                  >
                    {importResult.success ? 'Import Successful!' : 'Import Failed'}
                  </div>

                  {/* Success stats */}
                  {importResult.success && importResult.stats && (
                    <div className="mt-2 space-y-1 text-sm text-green-800">
                      {importResult.stats.foldersCreated !== undefined && (
                        <div>• {importResult.stats.foldersCreated} folder(s) imported</div>
                      )}
                      {importResult.stats.itemsAdded !== undefined && (
                        <div>• {importResult.stats.itemsAdded} item(s) added</div>
                      )}
                      {importResult.stats.sessionsCreated !== undefined && (
                        <div>• {importResult.stats.sessionsCreated} session(s) created</div>
                      )}
                    </div>
                  )}

                  {/* Warnings */}
                  {importResult.warnings.length > 0 && (
                    <div className="mt-3 text-sm">
                      <div className="font-medium text-amber-900">Warnings:</div>
                      <ul className="ml-4 mt-1 list-disc text-amber-800">
                        {importResult.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Errors */}
                  {importResult.errors.length > 0 && (
                    <div className="mt-2 text-sm">
                      <ul className="ml-4 list-disc text-red-800">
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
              <div className="font-medium">Conflict resolution:</div>
              <ul className="ml-4 mt-2 list-disc space-y-1">
                <li>Duplicate folders will be renamed with "(imported)" suffix</li>
                <li>Existing data will never be overwritten</li>
                <li>All sessions and history will be preserved</li>
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isImporting}
            className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importResult?.success ? 'Close' : 'Cancel'}
          </button>
          {!importResult && (
            <button
              type="button"
              onClick={handleImport}
              disabled={!selectedFile || isImporting}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {isImporting ? 'Importing...' : 'Import'}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
