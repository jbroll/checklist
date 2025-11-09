import type { InstanceOfSchema } from 'jazz-tools';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import { FileUploadDialog } from '@/components/ui/file-upload-dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import type { Account, FolderNode } from '@/schemas';
import { ImportService } from '@/services/import/importService';
import type { SessionImportResult } from '@/services/import/sessionImporter';

interface SessionImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: InstanceOfSchema<typeof FolderNode>;
  account: InstanceOfSchema<typeof Account>;
  onImportComplete?: () => void;
}

export function SessionImportDialog({
  open,
  onOpenChange,
  folder,
  account,
  onImportComplete,
}: SessionImportDialogProps) {
  const [sessionName, setSessionName] = useState('');

  const handleUpload = async (file: File, fileType: 'txt' | 'csv' | 'json') => {
    if (fileType !== 'csv') {
      throw new Error('Only CSV files are supported for session import');
    }

    const result = await ImportService.importSessionFromCsvFile(file, folder, account, {
      sessionName: sessionName.trim() || undefined,
      addMissingItems: false,
    });

    // Auto-close after successful import
    if (result.imported) {
      setTimeout(() => {
        onImportComplete?.();
        onOpenChange(false);
        setSessionName('');
      }, 2500);
    }

    return result;
  };

  const renderResult = (result: SessionImportResult) => {
    const hasSuccess = result.imported;
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
                ? 'Session Imported Successfully!'
                : hasErrors
                  ? 'Import Completed with Errors'
                  : 'Import Completed'}
            </div>

            <div className="mt-2 space-y-1 text-sm">
              {result.matched > 0 && (
                <div className="text-green-800">• {result.matched} item(s) matched</div>
              )}
              {result.unmatched > 0 && (
                <div className="text-amber-800">• {result.unmatched} item(s) not matched</div>
              )}
            </div>

            {result.unmatchedItems.length > 0 && (
              <div className="mt-3 text-sm">
                <div className="font-medium text-amber-900">Items not found in template:</div>
                <ul className="ml-4 mt-1 max-h-32 list-disc overflow-y-auto text-amber-800">
                  {result.unmatchedItems.slice(0, 10).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                  {result.unmatchedItems.length > 10 && (
                    <li>...and {result.unmatchedItems.length - 10} more</li>
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

  // Auto-generate session name from current date when file is selected
  const handleFileChange = (file: File | null) => {
    if (file && !sessionName) {
      const today = new Date().toISOString().split('T')[0];
      setSessionName(`[${today}]`);
    }
  };

  return (
    <FileUploadDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setSessionName('');
        }
        onOpenChange(isOpen);
      }}
      title="Import Shopping Session"
      description={`Import a session into ${folder.name} from a CSV file.`}
      acceptedFileTypes={['csv']}
      maxSizeMB={10}
      onUpload={handleUpload}
      renderResult={renderResult}
      uploadButtonText="Import Session"
      canUpload={(file) => !!file && sessionName.trim().length > 0}
      formFields={(file, result) => {
        // Auto-generate name when file is first selected
        if (file && !sessionName) {
          handleFileChange(file);
        }

        return !result ? (
          <FormField label="Session name" htmlFor="session-name" required>
            <Input
              id="session-name"
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="[2025-11-01] or custom name..."
            />
          </FormField>
        ) : null;
      }}
      infoContent={
        <>
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
        </>
      }
    />
  );
}
