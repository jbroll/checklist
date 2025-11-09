import type { InstanceOfSchema } from 'jazz-tools';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import { FileUploadDialog } from '@/components/ui/file-upload-dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import type { Account } from '@/schemas';
import { ImportService } from '@/services/import/importService';
import type { ImportResult } from '@/services/import/types';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: InstanceOfSchema<typeof Account>;
  onImportComplete?: () => void;
}

export function ImportDialog({ open, onOpenChange, account, onImportComplete }: ImportDialogProps) {
  const [fileType, setFileType] = useState<'json' | 'txt' | 'csv' | null>(null);
  const [templateName, setTemplateName] = useState('');

  const handleUpload = async (file: File, detectedType: 'json' | 'txt' | 'csv') => {
    setFileType(detectedType);

    // For TXT/CSV, require list name
    if (detectedType !== 'json' && !templateName.trim()) {
      throw new Error('Please enter a list name');
    }

    let result: ImportResult;

    if (detectedType === 'json') {
      result = await ImportService.importFromFile(file, account, 'json');
    } else {
      result = await ImportService.importAsNewTemplate(
        file,
        account,
        templateName.trim(),
        detectedType,
      );
    }

    if (result.success) {
      setTimeout(() => {
        onImportComplete?.();
        onOpenChange(false);
        setFileType(null);
        setTemplateName('');
      }, 2000);
    }

    return result;
  };

  const renderResult = (result: ImportResult) => (
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

          {result.warnings.length > 0 && (
            <div className="mt-3 text-sm">
              <div className="font-medium text-amber-900">Warnings:</div>
              <ul className="ml-4 mt-1 list-disc text-amber-800">
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {result.errors.length > 0 && (
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
      title="Import Grocery Data"
      description="Import full backup (JSON) or create new list from items list (TXT/CSV)."
      acceptedFileTypes={['json', 'txt', 'csv']}
      maxSizeMB={10}
      onUpload={handleUpload}
      renderResult={renderResult}
      uploadButtonText="Import"
      canUpload={(file) => {
        if (!file) return false;
        // For JSON, always allow. For TXT/CSV, require template name
        return fileType === 'json' || templateName.trim().length > 0;
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

          // Auto-generate template name from filename (for TXT/CSV)
          if (detectedType !== 'json' && !templateName) {
            const baseName = file.name.replace(/\.(txt|csv)$/i, '');
            setTemplateName(baseName);
          }
        }

        // Show template name input only for TXT/CSV and when no result
        return file && fileType !== 'json' && !result ? (
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
      infoContent={
        <>
          <div className="font-medium">File formats:</div>
          <ul className="ml-4 mt-2 list-disc space-y-1">
            <li>
              <strong>JSON:</strong> Full backup with folders, items, and sessions
            </li>
            <li>
              <strong>TXT/CSV:</strong> Creates new list at root with imported items
            </li>
          </ul>
          <div className="mt-3 font-medium">Import rules:</div>
          <ul className="ml-4 mt-2 list-disc space-y-1">
            <li>Duplicate folders renamed with numbered suffix (1), (2), (3)...</li>
            <li>Items auto-categorized if category not provided</li>
            <li>Existing data will never be overwritten</li>
          </ul>
        </>
      }
    />
  );
}
