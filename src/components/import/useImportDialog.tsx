import type { InstanceOfSchema } from 'jazz-tools';
import { useEffect, useRef, useState } from 'react';
import { ImportFormFields } from '@/components/import/ImportFormFields';
import type { Account, FolderNode } from '@/schemas';
import { generateUniqueFolderName } from '@/services/folderService';
import type { CsvImportResult } from '@/services/import/csvImporter';
import {
  importAsNewTemplate,
  importFromFile,
  importItemsFromCsvFile,
  importItemsFromTxtFile,
} from '@/services/import/importService';
import { parseTextMetadata, type TxtImportResult } from '@/services/import/txtImporter';
import type { ImportResult } from '@/services/import/types';
import { readFileAsText } from '@/utils/fileUpload';

// Track file identity for change detection
function getFileId(file: File | null): string {
  if (!file) return 'null';
  return `${file.name}-${file.size}-${file.lastModified}`;
}

type UnifiedImportResult = ImportResult | TxtImportResult | CsvImportResult;

interface DialogConfig {
  title: string;
  description: string;
  acceptedFileTypes: ('json' | 'txt' | 'csv')[];
  infoContent: React.ReactNode;
}

interface UseImportDialogProps {
  account: InstanceOfSchema<typeof Account>;
  folder?: InstanceOfSchema<typeof FolderNode>;
  parentFolder?: InstanceOfSchema<typeof FolderNode>;
  onImportComplete?: () => void;
  onOpenChange: (open: boolean) => void;
}

export function useImportDialog({
  account,
  folder: template,
  parentFolder,
  onImportComplete,
  onOpenChange,
}: UseImportDialogProps) {
  const [fileType, setFileType] = useState<'json' | 'txt' | 'csv' | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const lastFileIdRef = useRef<string>('null');

  const isFolderLevel = !!template;

  const resetState = () => {
    setFileType(null);
    setTemplateName('');
    setSelectedFile(null);
    lastFileIdRef.current = 'null';
  };

  // Auto-detect file type and template name when file changes
  useEffect(() => {
    if (!selectedFile) {
      setFileType(null);
      return;
    }

    const fileName = selectedFile.name.toLowerCase();
    let detectedType: 'json' | 'txt' | 'csv';
    if (fileName.endsWith('.json')) {
      detectedType = 'json';
    } else if (fileName.endsWith('.csv')) {
      detectedType = 'csv';
    } else {
      detectedType = 'txt';
    }

    setFileType(detectedType);

    // Auto-generate template name from metadata or filename (for TXT/CSV at top level)
    if (!isFolderLevel && detectedType !== 'json') {
      // Read file to check for metadata (for TXT files)
      const generateName = async () => {
        let baseName = selectedFile.name.replace(/\.(txt|csv)$/i, '');

        // For TXT files, try to extract name from metadata
        if (detectedType === 'txt') {
          try {
            const content = await readFileAsText(selectedFile);
            const metadata = parseTextMetadata(content);
            if (metadata.name) {
              baseName = metadata.name;
            }
          } catch {
            // Ignore read errors, use filename
          }
        }

        // Generate unique name to avoid duplicates
        const uniqueName = generateUniqueFolderName(baseName, account, parentFolder);
        setTemplateName(uniqueName);
      };

      generateName();
    }
  }, [selectedFile, isFolderLevel, account, parentFolder]);

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
        result = await importItemsFromCsvFile(file, template, account);
      } else if (detectedType === 'txt') {
        result = await importItemsFromTxtFile(file, template, account);
      } else {
        result = await importItemsFromCsvFile(file, template, account);
      }

      // Auto-close after successful import
      if ('imported' in result && result.imported > 0) {
        handleSuccessfulImport();
      }
    } else {
      // Top-level import
      if (detectedType === 'json') {
        // Full account import (with optional parent folder)
        result = await importFromFile(file, account, 'json', parentFolder);
      } else {
        // Create new template at root
        if (!templateName.trim()) {
          throw new Error('Please enter a list name');
        }
        result = await importAsNewTemplate(
          file,
          account,
          templateName.trim(),
          detectedType,
          parentFolder,
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

  const renderFormFields = (file: File | null, result: UnifiedImportResult | null) => {
    // Detect file changes and update state via effect
    const currentFileId = getFileId(file);
    if (currentFileId !== lastFileIdRef.current) {
      lastFileIdRef.current = currentFileId;
      // Schedule state update for after render
      Promise.resolve().then(() => {
        setSelectedFile(file);
      });
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
