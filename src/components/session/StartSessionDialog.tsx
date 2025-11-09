import { SimpleInputDialog } from '@/components/ui/simple-input-dialog';

interface StartSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (name: string) => void;
  folderName?: string;
}

// Generate default session name based on current date
const generateDefaultName = () => {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = now.toTimeString().slice(0, 5); // HH:MM
  return `[${dateStr} ${timeStr}]`;
};

export function StartSessionDialog({
  open,
  onOpenChange,
  onStart,
  folderName,
}: StartSessionDialogProps) {
  return (
    <SimpleInputDialog
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={onStart}
      title="Start Shopping Session"
      description={
        folderName
          ? `Create a new shopping session for "${folderName}"`
          : 'Create a new shopping session from this template'
      }
      inputLabel="Session Name (Optional)"
      inputPlaceholder={`Leave empty for auto-generated name: ${generateDefaultName()}`}
      submitButtonText="Start Shopping"
      defaultValueGenerator={generateDefaultName}
      required={false}
      helperText="Auto-generated names use the format [YYYY-MM-DD HH:MM]"
    />
  );
}
