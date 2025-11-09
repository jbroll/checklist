import type { InstanceOfSchema } from 'jazz-tools';
import { useState } from 'react';
import { ImportFormFields } from '@/components/import/ImportFormFields';
import type { Account, Template } from '@/schemas';
import type { CsvImportResult } from '@/services/import/csvImporter';
import { ImportService } from '@/services/import/importService';
import type { TxtImportResult } from '@/services/import/txtImporter';
import type { ImportResult } from '@/services/import/types';

type UnifiedImportResult = ImportResult | TxtImportResult | CsvImportResult;

interface DialogConfig {
  title: string;
  description: string;
  acceptedFileTypes: ('json' | 'txt' | 'csv')[];
  infoContent: React.ReactNode;
}

interface UseImportDialogProps {
  account: InstanceOfSchema<typeof Account>;
  folder?: InstanceOfSchema<typeof Template>;
  onImportComplete?: () => void;
  onOpenChange: (open: boolean) => void;
}

export function useImportDialog({
  account,
  folder: template,
  onImportComplete,
  onOpenChange,
}: UseImportDialogProps) {
  const [fileType, setFileType] = useState<'json' | 'txt' | 'csv' | null>(null);
  const [templateName, setTemplateName] = useState('');

  const isFolderLevel = !!template;

  const resetState = () => {
    setFileType(null);
    setTemplateName('');
  };

  const handleSuccessfulImport = () => {
    setTimeout(() => {
      onImportComplete?.();
      onOpenChange(false);
      resetState();
    }, 2000);
  };

  const handleUpload = async (file: File, detectedType: 'json' | 'txt' | 'csv') => {
    setFileType(detectedType);

    let result: UnifiedImportResult;

    // Template-level import
    if (template) {
      // Template import: JSON (items) or TXT/CSV (append items)
      if (detectedType === 'json') {
        // TODO: Import JSON items list - for now use TXT/CSV logic
        result = await ImportService.importItemsFromCsvFile(file, template, account);
      } else if (detectedType === 'txt') {
        result = await ImportService.importItemsFromTxtFile(file, template, account);
      } else {
        result = await ImportService.importItemsFromCsvFile(file, template, account);
      }

      // Auto-close after successful import
      if ('imported' in result && result.imported > 0) {
        handleSuccessfulImport();
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
        handleSuccessfulImport();
      }
    }

    return result;
  };

  const getDialogConfig = (): DialogConfig => {
    const learnMoreLink = (
      <a
        href="/help/imports.html"
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:text-blue-700 underline text-sm"
      >
        Learn more about import formats
      </a>
    );

    if (template) {
      return {
        title: `Import Items: ${template.name}`,
        description: 'Auto-detects JSON (items list) or TXT/CSV (append items).',
        acceptedFileTypes: ['json', 'txt', 'csv'],
        infoContent: learnMoreLink,
      };
    }

    return {
      title: 'Import',
      description: 'Auto-detects JSON (full backup) or TXT/CSV (create new list).',
      acceptedFileTypes: ['json', 'txt', 'csv'],
      infoContent: learnMoreLink,
    };
  };

  const handleFileTypeDetection = (file: File) => {
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
  };

  const renderFormFields = (file: File | null, result: UnifiedImportResult | null) => {
    // Auto-detect file type when file is selected
    if (file) {
      handleFileTypeDetection(file);
    }

    // Show template name input only for top-level TXT/CSV and when no result
    return file && !isFolderLevel && fileType !== 'json' && !result ? (
      <ImportFormFields templateName={templateName} onTemplateNameChange={setTemplateName} />
    ) : null;
  };

  const canUpload = (file: File | null) => {
    if (!file) return false;
    // For folder-level or JSON, always allow
    if (isFolderLevel || fileType === 'json') return true;
    // For top-level TXT/CSV, require template name
    return templateName.trim().length > 0;
  };

  return {
    fileType,
    templateName,
    resetState,
    handleUpload,
    getDialogConfig,
    renderFormFields,
    canUpload,
  };
}
