"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle, AlertTriangle, Info, X } from "lucide-react";
import { ValidatedContact, ValidationErrorCode, ValidationWarningCode, getErrorMessage, getWarningMessage } from "@/lib/validation/contact-validator";

interface ValidationTableProps {
  results: ValidatedContact[];
  onRowSelect?: (row: ValidatedContact) => void;
  onBulkFix?: () => void;
  onSkipErrors?: () => void;
  onOverwriteDuplicates?: () => void;
}

export default function ValidationTable({
  results,
  onRowSelect,
  onBulkFix,
  onSkipErrors,
  onOverwriteDuplicates,
}: ValidationTableProps) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  const getRowStatus = (result: ValidatedContact): "valid" | "warning" | "error" => {
    if (!result.valid) return "error";
    if (result.warnings.length > 0) return "warning";
    return "valid";
  };

  const getRowBgColor = (status: "valid" | "warning" | "error"): string => {
    switch (status) {
      case "valid":
        return "bg-green-50 hover:bg-green-100";
      case "warning":
        return "bg-yellow-50 hover:bg-yellow-100";
      case "error":
        return "bg-red-50 hover:bg-red-100";
    }
  };

  const getStatusIcon = (status: "valid" | "warning" | "error") => {
    switch (status) {
      case "valid":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case "error":
        return <AlertCircle className="h-5 w-5 text-red-600" />;
    }
  };

  const validCount = results.filter(r => r.valid && r.warnings.length === 0).length;
  const warningCount = results.filter(r => r.valid && r.warnings.length > 0).length;
  const errorCount = results.filter(r => !r.valid).length;

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <div className="text-2xl font-bold text-green-900">{validCount}</div>
              <div className="text-sm text-green-700">Valid</div>
            </div>
          </div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <div>
              <div className="text-2xl font-bold text-yellow-900">{warningCount}</div>
              <div className="text-sm text-yellow-700">Warnings</div>
            </div>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <div>
              <div className="text-2xl font-bold text-red-900">{errorCount}</div>
              <div className="text-sm text-red-700">Errors</div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {onBulkFix && (
          <button
            onClick={onBulkFix}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            Fix All
          </button>
        )}
        {onSkipErrors && errorCount > 0 && (
          <button
            onClick={onSkipErrors}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            Skip Errors ({errorCount})
          </button>
        )}
        {onOverwriteDuplicates && (
          <button
            onClick={onOverwriteDuplicates}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
          >
            Overwrite Duplicates
          </button>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Row
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Company
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Issues
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {results.map((result, index) => {
                const status = getRowStatus(result);
                return (
                  <tr
                    key={index}
                    className={`${getRowBgColor(status)} cursor-pointer transition-colors`}
                    onClick={() => {
                      setExpandedRow(expandedRow === index ? null : index);
                      onRowSelect?.(result);
                    }}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getStatusIcon(status)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {result.row_number}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {result.cleaned.email || (
                        <span className="text-gray-400 italic">Missing</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {result.cleaned.first_name || result.cleaned.last_name
                        ? `${result.cleaned.first_name || ""} ${result.cleaned.last_name || ""}`.trim()
                        : <span className="text-gray-400 italic">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {result.cleaned.company || (
                        <span className="text-gray-400 italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {result.errors.map((error, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 rounded text-xs"
                            title={getErrorMessage(error)}
                          >
                            <AlertCircle className="h-3 w-3" />
                            {getErrorMessage(error)}
                          </span>
                        ))}
                        {result.warnings.map((warning, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs"
                            title={getWarningMessage(warning)}
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {getWarningMessage(warning)}
                          </span>
                        ))}
                        {result.suggested_fix && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                            <Info className="h-3 w-3" />
                            Fix: {result.suggested_fix}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expanded Row Details */}
      {expandedRow !== null && (
        <div className="border rounded-lg p-4 bg-gray-50">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Row {results[expandedRow].row_number} Details
            </h3>
            <button
              onClick={() => setExpandedRow(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Original Data</h4>
              <pre className="text-xs bg-white p-3 rounded border overflow-auto">
                {JSON.stringify(results[expandedRow].original, null, 2)}
              </pre>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Cleaned Data</h4>
              <pre className="text-xs bg-white p-3 rounded border overflow-auto">
                {JSON.stringify(results[expandedRow].cleaned, null, 2)}
              </pre>
            </div>
          </div>

          {results[expandedRow].errors.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-red-700 mb-2">Errors</h4>
              <ul className="list-disc list-inside space-y-1">
                {results[expandedRow].errors.map((error, i) => (
                  <li key={i} className="text-sm text-red-600">
                    {getErrorMessage(error)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {results[expandedRow].warnings.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-yellow-700 mb-2">Warnings</h4>
              <ul className="list-disc list-inside space-y-1">
                {results[expandedRow].warnings.map((warning, i) => (
                  <li key={i} className="text-sm text-yellow-600">
                    {getWarningMessage(warning)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {results[expandedRow].duplicate_of && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-orange-700 mb-2">Duplicate</h4>
              <p className="text-sm text-orange-600">
                This contact duplicates existing contact ID: {results[expandedRow].duplicate_of}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}




























































