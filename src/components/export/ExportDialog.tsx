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
import type { GroceriesAccount } from '@/schemas';
import { ExportService } from '@/services/export/exportService';
import type { ExportScope } from '@/services/export/types';
import { downloadJson } from '@/utils/fileDownload';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: InstanceOfSchema<typeof GroceriesAccount>;
  /** Optional pre-selected folder ID for single-folder export */
  selectedFolderId?: string;
}

export function ExportDialog({ open, onOpenChange, account, selectedFolderId }: ExportDialogProps) {
  const [exportType, setExportType] = useState<'all-folders' | 'single-folder'>(
    selectedFolderId ? 'single-folder' : 'all-folders',
  );
  const [folderId, setFolderId] = useState(selectedFolderId || '');
  const [isExporting, setIsExporting] = useState(false);

  // Get list of folders for dropdown - filter out null values
  const folders = (account.root?.nodes || []).filter((f) => f != null);

  const handleExport = () => {
    setIsExporting(true);

    try {
      const scope: ExportScope =
        exportType === 'all-folders'
          ? { type: 'all-folders' }
          : { type: 'single-folder', folderId };

      // Export to JSON
      const data = ExportService.exportToJson(account, scope);

      // Generate filename
      const folderName =
        exportType === 'single-folder'
          ? folders.find((f) => f?.$jazz?.id === folderId)?.name
          : undefined;
      const filename = ExportService.generateFilename(scope, 'json', folderName);

      // Download file
      downloadJson(data, filename);

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
    setExportType(selectedFolderId ? 'single-folder' : 'all-folders');
    setFolderId(selectedFolderId || '');
    onOpenChange(false);
  };

  const canExport = exportType === 'all-folders' || (exportType === 'single-folder' && folderId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Export Grocery Data</DialogTitle>
          <DialogDescription>
            Export your grocery lists to a JSON file for backup or transfer.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Export scope selection */}
          <div className="grid gap-3">
            <Label>Export scope</Label>

            <div className="flex items-center gap-3">
              <input
                type="radio"
                id="export-all"
                checked={exportType === 'all-folders'}
                onChange={() => setExportType('all-folders')}
                className="h-4 w-4 border-neutral-300 text-green-600 focus:ring-2 focus:ring-green-500/20"
              />
              <Label htmlFor="export-all" className="cursor-pointer font-normal">
                All folders
              </Label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="radio"
                id="export-single"
                checked={exportType === 'single-folder'}
                onChange={() => setExportType('single-folder')}
                className="h-4 w-4 border-neutral-300 text-green-600 focus:ring-2 focus:ring-green-500/20"
              />
              <Label htmlFor="export-single" className="cursor-pointer font-normal">
                Selected folder
              </Label>
            </div>

            {/* Folder selection dropdown */}
            {exportType === 'single-folder' && (
              <div className="ml-7 mt-2">
                <select
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                >
                  <option value="">Select a folder...</option>
                  {folders.map((folder) => (
                    <option key={folder.$jazz.id} value={folder.$jazz.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Export details */}
          <div className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
            <div className="font-medium">What will be exported:</div>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li>All list items</li>
              <li>All sessions (active and completed)</li>
              <li>Session history and states</li>
            </ul>
            <div className="mt-2 text-xs text-neutral-600">
              Note: Sharing information will not be exported
            </div>
          </div>
        </div>

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
