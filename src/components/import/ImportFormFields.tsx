import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ImportFormFieldsProps {
  templateName: string;
  onTemplateNameChange: (name: string) => void;
  autoCategorize: boolean;
  onAutoCategorizeChange: (enabled: boolean) => void;
}

export function ImportFormFields({
  templateName,
  onTemplateNameChange,
  autoCategorize,
  onAutoCategorizeChange,
}: ImportFormFieldsProps) {
  return (
    <div className="space-y-4">
      <FormField label="List name" htmlFor="template-name" required>
        <Input
          id="template-name"
          type="text"
          value={templateName}
          onChange={(e) => onTemplateNameChange(e.target.value)}
          placeholder="Enter list name..."
          maxLength={100}
        />
      </FormField>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="auto-categorize"
          checked={autoCategorize}
          onChange={(e) => onAutoCategorizeChange(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <Label htmlFor="auto-categorize" className="text-sm font-normal cursor-pointer">
          Auto-categorize items
        </Label>
      </div>
    </div>
  );
}
