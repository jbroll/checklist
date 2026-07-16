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
import { useDialog } from '@/lib/dialog-context';
import { useRowboat } from '@/rowboat';
import type { FolderRow } from '@/schema/folder';
import { exportSessionToCsv, exportSessionToText } from '@/services/export/exportService';
import { downloadCsv, downloadText } from '@/utils/fileDownload';
import { buildExportFilename } from '@/utils/fileUtils';

interface SessionExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: FolderRow;
  sessionId: string;
  sessionName: string;
}

export function SessionExportDialog({
  open,
  onOpenChange,
  template,
  sessionId,
  sessionName,
}: SessionExportDialogProps) {
  const g = useRowboat();
  const [format, setFormat] = useState<'txt' | 'csv'>('txt');
  const [isExporting, setIsExporting] = useState(false);
  const { showAlert } = useDialog();

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const folderId = template.id;

      // Generate filename
      const filename = buildExportFilename(sessionName, format, true, 'session');

      if (format === 'txt') {
        const content = exportSessionToText(g, folderId, sessionId);
        downloadText(content, filename);
      } else {
        const content = exportSessionToCsv(g, folderId, sessionId);
        downloadCsv(content, filename);
      }

      // Close dialog
      onOpenChange(false);
    } catch (_error) {
      await showAlert({
        title: 'Export Failed',
        message: 'Export failed.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleCancel = () => {
    setFormat('txt');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Export Session: {sessionName}</DialogTitle>
          <DialogDescription>Export this shopping session to a text or CSV file.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Format selection */}
          <div className="grid gap-3">
            <Label>Export format</Label>

            <div className="flex items-center gap-3">
              <input
                type="radio"
                id="export-session-txt"
                checked={format === 'txt'}
                onChange={() => setFormat('txt')}
                className="h-4 w-4 border-neutral-300 text-green-600 focus:ring-2 focus:ring-green-500/20"
              />
              <Label htmlFor="export-session-txt" className="cursor-pointer font-normal">
                <div>
                  <div className="font-medium">Plain Text (.txt)</div>
                  <div className="text-xs text-neutral-600">
                    Item names with checkmarks (✓ = purchased)
                  </div>
                </div>
              </Label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="radio"
                id="export-session-csv"
                checked={format === 'csv'}
                onChange={() => setFormat('csv')}
                className="h-4 w-4 border-neutral-300 text-green-600 focus:ring-2 focus:ring-green-500/20"
              />
              <Label htmlFor="export-session-csv" className="cursor-pointer font-normal">
                <div>
                  <div className="font-medium">CSV (.csv)</div>
                  <div className="text-xs text-neutral-600">
                    Full session data with timestamps and states
                  </div>
                </div>
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={handleCancel} disabled={isExporting} variant="secondary">
            Cancel
          </Button>
          <Button type="button" onClick={handleExport} disabled={isExporting} variant="primary">
            <Download className="h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export & Download'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
