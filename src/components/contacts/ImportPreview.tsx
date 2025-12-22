"use client";

import { CheckCircle, AlertTriangle, AlertCircle, Download, Upload } from "lucide-react";
import { ValidationResult } from "@/lib/validation/contact-validator";

interface ImportPreviewProps {
  validationResult: ValidationResult;
  onImportValid: () => void;
  onImportAll: () => void;
  onCancel: () => void;
}

export default function ImportPreview({
  validationResult,
  onImportValid,
  onImportAll,
  onCancel,
}: ImportPreviewProps) {
  const { summary } = validationResult;

  return (
    <div className="space-y-6">
      <div className="border rounded-lg p-6 bg-white">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Import Preview</h3>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">{summary.total_rows}</div>
            <div className="text-sm text-gray-600">Total Rows</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{summary.valid}</div>
            <div className="text-sm text-green-700">Valid</div>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">{summary.warnings}</div>
            <div className="text-sm text-yellow-700">Warnings</div>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">{summary.invalid}</div>
            <div className="text-sm text-red-700">Errors</div>
          </div>
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">{summary.duplicates}</div>
            <div className="text-sm text-orange-700">Duplicates</div>
          </div>
        </div>

        {/* Error Breakdown */}
        {Object.keys(summary.errors_by_code).length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Error Breakdown</h4>
            <div className="space-y-1">
              {Object.entries(summary.errors_by_code).map(([code, count]) => (
                <div key={code} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{code}</span>
                  <span className="font-medium text-red-600">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warning Breakdown */}
        {Object.keys(summary.warnings_by_code).length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Warning Breakdown</h4>
            <div className="space-y-1">
              {Object.entries(summary.warnings_by_code).map(([code, count]) => (
                <div key={code} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{code}</span>
                  <span className="font-medium text-yellow-600">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-blue-900 mb-1">Recommendations</h4>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                {summary.invalid > 0 && (
                  <li>
                    {summary.invalid} rows have errors and will be skipped if you import valid contacts only.
                  </li>
                )}
                {summary.duplicates > 0 && (
                  <li>
                    {summary.duplicates} duplicate contacts found. Consider overwriting or skipping them.
                  </li>
                )}
                {summary.warnings > 0 && (
                  <li>
                    {summary.warnings} rows have warnings but are still valid. Review them before importing.
                  </li>
                )}
                {summary.valid === 0 && (
                  <li className="text-red-600 font-medium">
                    No valid contacts found. Please fix errors before importing.
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onImportValid}
            disabled={summary.valid === 0}
            className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors ${
              summary.valid === 0
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-green-600 text-white hover:bg-green-700"
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Import Valid Contacts ({summary.valid})
            </div>
          </button>

          {summary.invalid > 0 && (
            <button
              onClick={onImportAll}
              className="px-6 py-3 rounded-lg font-medium bg-yellow-600 text-white hover:bg-yellow-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Import All (Not Recommended)
              </div>
            </button>
          )}

          <button
            onClick={onCancel}
            className="px-6 py-3 rounded-lg font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}




























































