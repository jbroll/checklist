import type { InstanceOfSchema } from 'jazz-tools';
import { Download } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import type { Account, FolderNode } from '@/schemas';
import { ExportService } from '@/services/export/exportService';
import type { ExportScope } from '@/services/export/types';
import { downloadCsv, downloadJson, downloadText } from '@/utils/fileDownload';
import { buildExportFilename } from '@/utils/fileUtils';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: InstanceOfSchema<typeof Account>;
  /** Optional folder for folder-level export */
  folder?: InstanceOfSchema<typeof FolderNode>;
}

export function ExportDialog({ open, onOpenChange, account, folder }: ExportDialogProps) {
  const isTemplate = folder?.type === 'template-folder';

  // For folder-level template export, allow format selection
  const [format, setFormat] = useState<'json' | 'txt' | 'csv'>('json');
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = () => {
    setIsExporting(true);

    try {
      if (folder && isTemplate) {
        // Template folder: Export items with format selection
        const fId = folder.$jazz?.id;
        if (!fId) {
          throw new Error('Folder ID not found');
        }

        const filename = buildExportFilename(folder.name, format, true, undefined);

        if (format === 'json') {
          const scope: ExportScope = { type: 'single-folder', folderId: fId };
          const data = ExportService.exportToJson(account, scope);
          downloadJson(data, filename);
        } else if (format === 'txt') {
          const content = ExportService.exportTemplateItemsToText(account, fId);
          downloadText(content, filename);
        } else {
          const content = ExportService.exportTemplateItemsToCsv(account, fId);
          downloadCsv(content, filename);
        }
      } else if (folder) {
        // Organizational folder: JSON only
        const fId = folder.$jazz?.id;
        if (!fId) {
          throw new Error('Folder ID not found');
        }

        const scope: ExportScope = { type: 'single-folder', folderId: fId };
        const data = ExportService.exportToJson(account, scope);
        const filename = ExportService.generateFilename(scope, 'json', folder.name);
        downloadJson(data, filename);
      } else {
        // Top-level: JSON only, export all folders
        const scope: ExportScope = { type: 'all-folders' };
        const data = ExportService.exportToJson(account, scope);
        const filename = ExportService.generateFilename(scope, 'json', undefined);
        downloadJson(data, filename);
      }

      // Close dialog
      onOpenChange(false);
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCancel = () => {
    setFormat('json');
    onOpenChange(false);
  };

  const canExport = true;

  // Get dynamic configuration based on context
  const getConfig = () => {
    if (folder && isTemplate) {
      return {
        title: `Export: ${folder.name}`,
        description: 'Choose format for export.',
        content: (
          <>
            {/* Format selection for templates */}
            <div className="grid gap-3">
              <Label>Export format</Label>

              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  id="export-json"
                  checked={format === 'json'}
                  onChange={() => setFormat('json')}
                  className="h-4 w-4 border-neutral-300 text-green-600 focus:ring-2 focus:ring-green-500/20"
                />
                <Label htmlFor="export-json" className="cursor-pointer font-normal">
                  <div>
                    <div className="font-medium">JSON (.json)</div>
                    <div className="text-xs text-neutral-600">
                      Full backup with items and sessions
                    </div>
                  </div>
                </Label>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  id="export-txt"
                  checked={format === 'txt'}
                  onChange={() => setFormat('txt')}
                  className="h-4 w-4 border-neutral-300 text-green-600 focus:ring-2 focus:ring-green-500/20"
                />
                <Label htmlFor="export-txt" className="cursor-pointer font-normal">
                  <div>
                    <div className="font-medium">Plain Text (.txt)</div>
                    <div className="text-xs text-neutral-600">Tab-indented hierarchy</div>
                  </div>
                </Label>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  id="export-csv"
                  checked={format === 'csv'}
                  onChange={() => setFormat('csv')}
                  className="h-4 w-4 border-neutral-300 text-green-600 focus:ring-2 focus:ring-green-500/20"
                />
                <Label htmlFor="export-csv" className="cursor-pointer font-normal">
                  <div>
                    <div className="font-medium">CSV (.csv)</div>
                    <div className="text-xs text-neutral-600">
                      Includes name, category, sort order, quantity
                    </div>
                  </div>
                </Label>
              </div>
            </div>
          </>
        ),
      };
    }

    if (folder) {
      return {
        title: `Export: ${folder.name}`,
        description: 'Export to JSON for backup or transfer.',
        content: null,
      };
    }

    return {
      title: 'Export',
      description: 'Export to JSON for backup or transfer.',
      content: null,
    };
  };

  const config = getConfig();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">{config.content}</div>

        <DialogFooter>
          <Button type="button" onClick={handleCancel} disabled={isExporting} variant="secondary">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleExport}
            disabled={!canExport || isExporting}
            variant="primary"
          >
            <Download className="h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export & Download'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
