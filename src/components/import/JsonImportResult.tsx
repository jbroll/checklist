import { AlertCircle, CheckCircle } from 'lucide-react';
import type { ImportResult } from '@/services/import/types';

interface JsonImportResultProps {
  result: ImportResult;
}

export function JsonImportResult({ result }: JsonImportResultProps) {
  return (
    <output
      aria-live="polite"
      aria-atomic="true"
      className={`rounded-lg border p-4 ${
        result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
      }`}
    >
      <div className="flex items-start gap-3">
        {result.success ? (
          <CheckCircle className="h-5 w-5 text-green-600" aria-hidden="true" />
        ) : (
          <AlertCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
        )}
        <div className="flex-1">
          <div className={`font-medium ${result.success ? 'text-green-900' : 'text-red-900'}`}>
            {result.success ? 'Import Successful!' : 'Import Failed'}
          </div>

          {result.success && result.stats && (
            <div className="mt-2 space-y-1 text-sm text-green-800">
              {result.stats.foldersCreated !== undefined && (
                <div>• {result.stats.foldersCreated} folder(s) imported</div>
              )}
              {result.stats.itemsAdded !== undefined && (
                <div>• {result.stats.itemsAdded} item(s) added</div>
              )}
              {result.stats.sessionsCreated !== undefined && (
                <div>• {result.stats.sessionsCreated} session(s) created</div>
              )}
            </div>
          )}

          {result.warnings && result.warnings.length > 0 && (
            <div className="mt-3 text-sm">
              <div className="font-medium text-amber-900">Warnings:</div>
              <ul className="ml-4 mt-1 list-disc text-amber-800">
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {result.errors && result.errors.length > 0 && (
            <div className="mt-2 text-sm">
              <ul className="ml-4 list-disc text-red-800">
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
