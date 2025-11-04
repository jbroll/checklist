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
import type { FolderNode, GroceriesAccount } from '@/schemas';
import { ExportService } from '@/services/export/exportService';
import { downloadCsv, downloadText } from '@/utils/fileDownload';

interface TemplateItemsExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: InstanceOfSchema<typeof FolderNode>;
  account: InstanceOfSchema<typeof GroceriesAccount>;
}

export function TemplateItemsExportDialog({
  open,
  onOpenChange,
  folder,
  account,
}: TemplateItemsExportDialogProps) {
  const [format, setFormat] = useState<'txt' | 'csv'>('txt');
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = () => {
    setIsExporting(true);

    try {
      const folderId = folder.$jazz?.id;
      if (!folderId) {
        throw new Error('Folder ID not found');
      }

      // Generate filename
      const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const safeName = folder.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const filename = `${safeName}-items-${timestamp}.${format}`;

      if (format === 'txt') {
        const content = ExportService.exportTemplateItemsToText(account, folderId);
        downloadText(content, filename);
      } else {
        const content = ExportService.exportTemplateItemsToCsv(account, folderId);
        downloadCsv(content, filename);
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
    setFormat('txt');
    onOpenChange(false);
  };

  const itemCount = folder.items?.filter((item) => item && !item.archived).length || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Export Items: {folder.name}</DialogTitle>
          <DialogDescription>
            Export list items to a text or CSV file for sharing or backup.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Format selection */}
          <div className="grid gap-3">
            <Label>Export format</Label>

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
                  <div className="text-xs text-neutral-600">One item name per line</div>
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

          {/* Export details */}
          <div className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
            <div className="font-medium">What will be exported:</div>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li>
                {itemCount} list item{itemCount !== 1 ? 's' : ''}
              </li>
              <li>Active items only (archived items excluded)</li>
              {format === 'csv' && <li>Category and sort order information</li>}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={handleCancel} disabled={isExporting} variant="secondary">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleExport}
            disabled={isExporting || itemCount === 0}
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
