import { Upload } from 'lucide-react';
import type { ReactNode } from 'react';
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
import { useDialog } from '@/lib/dialog-context';

type FileType = 'json' | 'txt' | 'csv';

interface FileUploadDialogProps<TResult> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  acceptedFileTypes: FileType[];
  maxSizeMB: number;
  onUpload: (file: File, fileType: FileType) => Promise<TResult>;
  /** Optional form fields to render above file upload area */
  formFields?: (file: File | null, result: TResult | null) => ReactNode;
  /** Render the upload result */
  renderResult: (result: TResult) => ReactNode;
  /** Info box content shown when no result */
  infoContent: ReactNode;
  /** Button text for upload action */
  uploadButtonText?: string;
  /** Optional validation before upload */
  canUpload?: (file: File | null) => boolean;
}

export function FileUploadDialog<TResult>({
  open,
  onOpenChange,
  title,
  description,
  acceptedFileTypes,
  maxSizeMB,
  onUpload,
  formFields,
  renderResult,
  infoContent,
  uploadButtonText = 'Import',
  canUpload,
}: FileUploadDialogProps<TResult>) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<FileType | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<TResult | null>(null);
  const { showAlert } = useDialog();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const validateAndSetFile = async (file: File) => {
    // Validate file type
    const fileName = file.name.toLowerCase();
    const detectedType = acceptedFileTypes.find((type) => fileName.endsWith(`.${type}`));

    if (!detectedType) {
      await showAlert({
        title: 'Invalid File Type',
        message: 'Invalid file type.',
      });
      return;
    }

    // Validate file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSizeMB) {
      await showAlert({
        title: 'File Too Large',
        message: 'File too large.',
      });
      return;
    }

    setFileType(detectedType);
    setSelectedFile(file);
    setResult(null);
  };

  const handleUpload = async () => {
    if (!selectedFile || !fileType) return;

    setIsUploading(true);
    setResult(null);

    try {
      const uploadResult = await onUpload(selectedFile, fileType);
      setResult(uploadResult);
    } catch (_error) {
      await showAlert({
        title: 'Upload Failed',
        message: 'Upload failed.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setFileType(null);
    setResult(null);
    setIsDragging(false);
  };

  const handleCancel = () => {
    handleReset();
    onOpenChange(false);
  };

  const uploadEnabled = canUpload ? canUpload(selectedFile) : !!selectedFile;

  const fileTypeList = acceptedFileTypes.map((t) => t.toUpperCase()).join(', ');
  const acceptString = acceptedFileTypes.map((t) => `.${t}`).join(',');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Optional form fields */}
          {formFields?.(selectedFile, result)}

          {/* File upload area */}
          {!selectedFile && (
            // biome-ignore lint/a11y/useSemanticElements: Drag-drop zone
            <div
              role="button"
              tabIndex={0}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                isDragging ? 'border-green-500 bg-green-50' : 'border-neutral-300 bg-neutral-50'
              }`}
            >
              <Upload
                className={`mb-3 h-12 w-12 ${isDragging ? 'text-green-600' : 'text-neutral-400'}`}
              />
              <p className="mb-2 text-sm font-medium text-neutral-700">
                {isDragging ? 'Drop file here' : `Drop ${fileTypeList} file here or`}
              </p>
              <label
                htmlFor="file-upload"
                className="cursor-pointer rounded-md bg-white px-3 py-2 text-sm font-medium text-green-600 hover:bg-green-50"
              >
                Browse Files
              </label>
              <input
                id="file-upload"
                type="file"
                accept={acceptString}
                onChange={handleFileSelect}
                className="hidden"
              />
              <p className="mt-2 text-xs text-neutral-500">
                {fileTypeList} files, up to {maxSizeMB}MB
              </p>
            </div>
          )}

          {/* Selected file info */}
          {selectedFile && !result && (
            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-neutral-900">{selectedFile.name}</div>
                  <div className="text-sm text-neutral-600">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                    {fileType && ` • ${fileType.toUpperCase()}`}
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={handleReset}
                  variant="link"
                  className="text-neutral-500 hover:text-neutral-700"
                >
                  Change
                </Button>
              </div>
            </div>
          )}

          {/* Upload result */}
          {result && renderResult(result)}

          {/* Info box */}
          {!result && (
            <div className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
              {infoContent}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" onClick={handleCancel} disabled={isUploading} variant="secondary">
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button
              type="button"
              onClick={handleUpload}
              disabled={!uploadEnabled || isUploading}
              variant="primary"
            >
              <Upload className="h-4 w-4" />
              {isUploading ? 'Uploading...' : uploadButtonText}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
