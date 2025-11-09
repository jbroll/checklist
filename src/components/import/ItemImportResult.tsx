import { AlertCircle, CheckCircle } from 'lucide-react';
import type { CsvImportResult } from '@/services/import/csvImporter';
import type { TxtImportResult } from '@/services/import/txtImporter';

interface ItemImportResultProps {
  result: TxtImportResult | CsvImportResult;
}

export function ItemImportResult({ result }: ItemImportResultProps) {
  const hasSuccess = result.imported > 0;
  const hasErrors = result.errors.length > 0;

  return (
    <output
      aria-live="polite"
      aria-atomic="true"
      className={`rounded-lg border p-4 ${
        hasSuccess && !hasErrors
          ? 'border-green-200 bg-green-50'
          : hasErrors
            ? 'border-red-200 bg-red-50'
            : 'border-amber-200 bg-amber-50'
      }`}
    >
      <div className="flex items-start gap-3">
        {hasSuccess && !hasErrors ? (
          <CheckCircle className="h-5 w-5 text-green-600" aria-hidden="true" />
        ) : (
          <AlertCircle
            className={`h-5 w-5 ${hasErrors ? 'text-red-600' : 'text-amber-600'}`}
            aria-hidden="true"
          />
        )}
        <div className="flex-1">
          <div
            className={`font-medium ${
              hasSuccess && !hasErrors
                ? 'text-green-900'
                : hasErrors
                  ? 'text-red-900'
                  : 'text-amber-900'
            }`}
          >
            {hasSuccess && !hasErrors
              ? 'Import Successful!'
              : hasErrors
                ? 'Import Completed with Errors'
                : 'Import Completed'}
          </div>

          <div className="mt-2 space-y-1 text-sm">
            {result.imported > 0 && (
              <div className="text-green-800">• {result.imported} item(s) imported</div>
            )}
            {result.skipped > 0 && (
              <div className="text-amber-800">
                • {result.skipped} item(s) skipped (duplicates)
              </div>
            )}
          </div>

          {result.duplicates && result.duplicates.length > 0 && (
            <div className="mt-3 text-sm">
              <div className="font-medium text-amber-900">Skipped duplicates:</div>
              <ul className="ml-4 mt-1 max-h-32 list-disc overflow-y-auto text-amber-800">
                {result.duplicates.slice(0, 10).map((item) => (
                  <li key={item}>{item}</li>
                ))}
                {result.duplicates.length > 10 && (
                  <li>...and {result.duplicates.length - 10} more</li>
                )}
              </ul>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="mt-2 text-sm">
              <div className="font-medium text-red-900">Errors:</div>
              <ul className="ml-4 mt-1 list-disc text-red-800">
                {result.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </output>
  );
}
