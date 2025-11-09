import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

interface ImportFormFieldsProps {
  templateName: string;
  onTemplateNameChange: (name: string) => void;
}

export function ImportFormFields({
  templateName,
  onTemplateNameChange,
}: ImportFormFieldsProps) {
  return (
    <FormField label="List name" htmlFor="template-name" required>
      <Input
        id="template-name"
        type="text"
        value={templateName}
        onChange={(e) => onTemplateNameChange(e.target.value)}
        placeholder="Enter list name..."
      />
    </FormField>
  );
}
