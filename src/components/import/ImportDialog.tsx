import type { InstanceOfSchema } from 'jazz-tools';
import { ItemImportResult } from '@/components/import/ItemImportResult';
import { JsonImportResult } from '@/components/import/JsonImportResult';
import { useImportDialog } from '@/components/import/useImportDialog';
import { FileUploadDialog } from '@/components/ui/file-upload-dialog';
import type { Account, Template } from '@/schemas';
import type { CsvImportResult } from '@/services/import/csvImporter';
import type { TxtImportResult } from '@/services/import/txtImporter';
import type { ImportResult } from '@/services/import/types';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: InstanceOfSchema<typeof Account>;
  /** Optional folder for folder-level import */
  folder?: InstanceOfSchema<typeof Template>;
  onImportComplete?: () => void;
}

type UnifiedImportResult = ImportResult | TxtImportResult | CsvImportResult;

export function ImportDialog({
  open,
  onOpenChange,
  account,
  folder: template,
  onImportComplete,
}: ImportDialogProps) {
  const { resetState, handleUpload, getDialogConfig, renderFormFields, canUpload } =
    useImportDialog({
      account,
      folder: template,
      onImportComplete,
      onOpenChange,
    });

  const config = getDialogConfig();

  const renderResult = (result: UnifiedImportResult) => {
    // Handle TXT/CSV import result (for template items)
    if ('imported' in result) {
      return <ItemImportResult result={result} />;
    }

    // Handle JSON import result
    return <JsonImportResult result={result} />;
  };

  return (
    <FileUploadDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          resetState();
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
      canUpload={canUpload}
      formFields={renderFormFields}
      infoContent={config.infoContent}
    />
  );
}
