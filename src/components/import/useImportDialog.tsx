import { useEffect, useRef, useState } from 'react';
import { ImportFormFields } from '@/components/import/ImportFormFields';
import { usePort, useRowboat } from '@/rowboat';
import type { FolderRow } from '@/schema/folder';
import * as folderOps from '@/services/folderOps';
import type { CsvImportResult } from '@/services/import/csvImporter';
import {
  type ImportAsNewTemplateOptions,
  importAsNewTemplate,
  importFromFile,
  importItemsFromCsvFile,
  importItemsFromJsonFile,
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

// Generate a unique folder name by checking siblings
function generateUniqueFolderName(baseName: string, siblings: FolderRow[]): string {
  const existingNames = new Set(
    siblings.filter((f) => !f.archived).map((f) => f.name.toLowerCase()),
  );

  if (!existingNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  for (let suffix = 2; suffix <= 100; suffix++) {
    const candidateName = `${baseName} (${suffix})`;
    if (!existingNames.has(candidateName.toLowerCase())) {
      return candidateName;
    }
  }

  return `${baseName} (${Date.now()})`;
}

type UnifiedImportResult = ImportResult | TxtImportResult | CsvImportResult;

interface DialogConfig {
  title: string;
  description: string;
  acceptedFileTypes: ('json' | 'txt' | 'csv')[];
  infoContent: React.ReactNode;
}

interface UseImportDialogProps {
  folder?: FolderRow;
  parentFolder?: FolderRow;
  onImportComplete?: () => void;
  onOpenChange: (open: boolean) => void;
}

export function useImportDialog({
  folder: template,
  parentFolder,
  onImportComplete,
  onOpenChange,
}: UseImportDialogProps) {
  const g = useRowboat();
  const { author, mintGroup } = usePort();
  const [fileType, setFileType] = useState<'json' | 'txt' | 'csv' | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [autoCategorize, setAutoCategorize] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const lastFileIdRef = useRef<string>('null');

  const isFolderLevel = !!template;
  const parentId = parentFolder?.id ?? null;

  const resetState = () => {
    setFileType(null);
    setTemplateName('');
    setAutoCategorize(false);
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

        const siblings = folderOps.childrenOf(g, parentId);
        setTemplateName(generateUniqueFolderName(baseName, siblings));
      };

      generateName();
    }
  }, [selectedFile, isFolderLevel, g, parentId]);

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
      if (detectedType === 'json') {
        result = await importItemsFromJsonFile(g, template.id, file);
      } else if (detectedType === 'txt') {
        result = await importItemsFromTxtFile(g, template.id, file);
      } else {
        result = await importItemsFromCsvFile(g, template.id, file);
      }

      // Auto-close after successful import
      if ('imported' in result && result.imported > 0) {
        handleSuccessfulImport();
      }
    } else {
      if (!author || !mintGroup) {
        throw new Error('useImportDialog: no author/mintGroup available');
      }
      const ctx = { createdBy: author, mintGroup, parentId };

      // Top-level import
      if (detectedType === 'json') {
        // Full backup import (with optional parent folder)
        result = await importFromFile(g, file, ctx, 'json');
      } else {
        // Create new template at root (or under parentFolder)
        if (!templateName.trim()) {
          throw new Error('Please enter a list name');
        }
        const options: ImportAsNewTemplateOptions = { autoCategorize };
        result = await importAsNewTemplate(
          g,
          file,
          templateName.trim(),
          detectedType,
          ctx,
          options,
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
      <ImportFormFields
        templateName={templateName}
        onTemplateNameChange={setTemplateName}
        autoCategorize={autoCategorize}
        onAutoCategorizeChange={setAutoCategorize}
      />
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
