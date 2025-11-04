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
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import type { FolderNode, GroceriesAccount } from '@/schemas';
import { ImportService } from '@/services/import/importService';
import type { SessionImportResult } from '@/services/import/sessionImporter';
import { isValidFileSize, isValidFileType } from '@/utils/fileUpload';

interface SessionImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: InstanceOfSchema<typeof FolderNode>;
  account: InstanceOfSchema<typeof GroceriesAccount>;
  onImportComplete?: () => void;
}

export function SessionImportDialog({
  open,
  onOpenChange,
  folder,
  account,
  onImportComplete,
}: SessionImportDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<SessionImportResult | null>(null);
  const [sessionName, setSessionName] = useState('');

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
    if (!isValidFileType(file, ['csv'])) {
      alert('Please select a CSV file (.csv)');
      return;
    }

    // Validate file size (10MB max)
    if (!isValidFileSize(file, 10)) {
      alert('File size exceeds 10MB limit');
      return;
    }

    setSelectedFile(file);
    setImportResult(null);

    // Auto-generate session name from current date if empty
    if (!sessionName) {
      const today = new Date().toISOString().split('T')[0];
      setSessionName(`[${today}]`);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setIsImporting(true);
    setImportResult(null);

    try {
      const result = await ImportService.importSessionFromCsvFile(selectedFile, folder, account, {
        sessionName: sessionName.trim() || undefined,
        addMissingItems: false, // TODO: Add checkbox for this option
      });

      setImportResult(result);

      // Auto-close after successful import
      if (result.imported) {
        setTimeout(() => {
          onImportComplete?.();
          onOpenChange(false);
          handleReset();
        }, 2500);
      }
    } catch (error) {
      setImportResult({
        imported: false,
        matched: 0,
        unmatched: 0,
        errors: [`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        unmatchedItems: [],
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setImportResult(null);
    setIsDragging(false);
    setSessionName('');
  };

  const handleCancel = () => {
    handleReset();
    onOpenChange(false);
  };

  const hasSuccess = importResult?.imported;
  const hasErrors = importResult && importResult.errors.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Import Shopping Session</DialogTitle>
          <DialogDescription>
            Import a session into {folder.name} from a CSV file.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Session name input */}
          {!importResult && (
            <FormField label="Session name" htmlFor="session-name" required>
              <Input
                id="session-name"
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="[2025-11-01] or custom name..."
              />
            </FormField>
          )}

          {/* File upload area */}
          {!selectedFile && (
            // biome-ignore lint/a11y/useSemanticElements: Drag-drop zone
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
                {isDragging ? 'Drop file here' : 'Drop CSV file here or'}
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
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              <p className="mt-2 text-xs text-neutral-500">CSV files only, up to 10MB</p>
            </div>
          )}

          {/* Selected file info */}
          {selectedFile && !importResult && (
            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-neutral-900">{selectedFile.name}</div>
                  <div className="text-sm text-neutral-600">
                    {(selectedFile.size / 1024).toFixed(1)} KB • CSV
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
                      ? 'Session Imported Successfully!'
                      : hasErrors
                        ? 'Import Completed with Errors'
                        : 'Import Completed'}
                  </div>

                  {/* Success stats */}
                  <div className="mt-2 space-y-1 text-sm">
                    {importResult.matched > 0 && (
                      <div className="text-green-800">• {importResult.matched} item(s) matched</div>
                    )}
                    {importResult.unmatched > 0 && (
                      <div className="text-amber-800">
                        • {importResult.unmatched} item(s) not matched
                      </div>
                    )}
                  </div>

                  {/* Unmatched items list */}
                  {importResult.unmatchedItems.length > 0 && (
                    <div className="mt-3 text-sm">
                      <div className="font-medium text-amber-900">Items not found in template:</div>
                      <ul className="ml-4 mt-1 max-h-32 list-disc overflow-y-auto text-amber-800">
                        {importResult.unmatchedItems.slice(0, 10).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                        {importResult.unmatchedItems.length > 10 && (
                          <li>...and {importResult.unmatchedItems.length - 10} more</li>
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
                  <strong>CSV:</strong> Columns: name, category, inCart, purchased, addedToCartAt,
                  purchasedAt
                </li>
              </ul>
              <div className="mt-3 font-medium">Import rules:</div>
              <ul className="ml-4 mt-2 list-disc space-y-1">
                <li>Items are matched by name (case-insensitive)</li>
                <li>Items not in template will be skipped</li>
                <li>Timestamps are optional</li>
                <li>Creates new session, never overwrites existing sessions</li>
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
              disabled={!selectedFile || isImporting || !sessionName.trim()}
              variant="primary"
            >
              <Upload className="h-4 w-4" />
              {isImporting ? 'Importing...' : 'Import Session'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
