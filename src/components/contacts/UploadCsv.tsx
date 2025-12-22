"use client";

import { useState, useRef } from 'react';
import { FieldMapping } from '@/lib/contacts/parseCsv';

interface UploadCsvProps {
  workspaceId: string;
  onImportComplete: (result: any) => void;
  onClose: () => void;
}

interface ImportResult {
  success: boolean;
  importBatchId: string;
  summary: {
    totalRows: number;
    validRows: number;
    inserted: number;
    duplicates: number;
    suppressed: number;
    errors: number;
  };
  parseErrors: string[];
}

export function UploadCsv({ workspaceId, onImportComplete, onClose }: UploadCsvProps) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<any[]>([]);
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({ email: '' });
  const [isUploading, setIsUploading] = useState(false);
  const [currentStep, setCurrentStep] = useState<'upload' | 'map' | 'import'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    try {
      const content = await file.text();
      
      // Get preview from API
      const response = await fetch(`/api/contacts/import?content=${encodeURIComponent(content)}`);
      if (!response.ok) {
        throw new Error('Failed to preview file');
      }

      const preview = await response.json();
      setHeaders(preview.headers);
      setSampleRows(preview.sampleRows);

      // Auto-map fields
      const autoMapping: FieldMapping = { email: '' };
      preview.headers.forEach((header: string) => {
        const lowerHeader = header.toLowerCase().trim();
        
        if (lowerHeader.includes('email') || lowerHeader === 'e-mail') {
          autoMapping.email = header;
        } else if (lowerHeader.includes('first') || lowerHeader === 'fname') {
          autoMapping.first_name = header;
        } else if (lowerHeader.includes('last') || lowerHeader === 'lname') {
          autoMapping.last_name = header;
        } else if (lowerHeader.includes('company') || lowerHeader === 'org') {
          autoMapping.company = header;
        } else if (lowerHeader.includes('title') || lowerHeader.includes('job')) {
          autoMapping.title = header;
        } else if (lowerHeader.includes('phone')) {
          autoMapping.phone = header;
        }
      });

      // Ensure we have an email field
      if (!autoMapping.email && preview.headers.length > 0) {
        autoMapping.email = preview.headers[0];
      }

      setFieldMapping(autoMapping);
      setCurrentStep('map');
    } catch (error) {
      console.error('Error processing file:', error);
      alert('Failed to process file. Please try again.');
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFile(file);
      processFile(file);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setIsUploading(true);
    setCurrentStep('import');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('workspaceId', workspaceId);
      formData.append('fieldMapping', JSON.stringify(fieldMapping));
      formData.append('options', JSON.stringify({
        onConflict: 'skip',
        respectSuppression: true
      }));

      const response = await fetch('/api/contacts/import', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Import failed');
      }

      const result: ImportResult = await response.json();
      
      if (result.success) {
        onImportComplete(result);
      } else {
        throw new Error('Import failed');
      }

    } catch (error: any) {
      console.error('Import error:', error);
      alert(`Import failed: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const resetUpload = () => {
    setFile(null);
    setHeaders([]);
    setSampleRows([]);
    setFieldMapping({ email: '' });
    setCurrentStep('upload');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (currentStep === 'upload') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Upload CSV</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <div className="space-y-2">
              <div className="text-4xl">📁</div>
              <p className="text-lg font-medium">Select your CSV file</p>
              <p className="text-sm text-gray-500">
                Drag and drop or click to browse
              </p>
            </div>
          </div>

          <div className="mt-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              Choose File
            </button>
          </div>

          <div className="mt-4 text-xs text-gray-500">
            <p>Supported format: CSV with headers</p>
            <p>Required columns: email (first_name, last_name, company, title, phone are optional)</p>
          </div>
        </div>
      </div>
    );
  }

  if (currentStep === 'map') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Map CSV Fields</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          <div className="mb-6">
            <h3 className="font-medium mb-2">Field Mapping</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email * (required)
                </label>
                <select
                  value={fieldMapping.email}
                  onChange={(e) => setFieldMapping({ ...fieldMapping, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Select a column</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name
                </label>
                <select
                  value={fieldMapping.first_name || ''}
                  onChange={(e) => setFieldMapping({ ...fieldMapping, first_name: e.target.value || undefined })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Select a column</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name
                </label>
                <select
                  value={fieldMapping.last_name || ''}
                  onChange={(e) => setFieldMapping({ ...fieldMapping, last_name: e.target.value || undefined })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Select a column</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company
                </label>
                <select
                  value={fieldMapping.company || ''}
                  onChange={(e) => setFieldMapping({ ...fieldMapping, company: e.target.value || undefined })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Select a column</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <select
                  value={fieldMapping.title || ''}
                  onChange={(e) => setFieldMapping({ ...fieldMapping, title: e.target.value || undefined })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Select a column</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <select
                  value={fieldMapping.phone || ''}
                  onChange={(e) => setFieldMapping({ ...fieldMapping, phone: e.target.value || undefined })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Select a column</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-medium mb-2">Preview (first 5 rows)</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    {headers.map((header) => (
                      <th key={header} className="border border-gray-200 px-3 py-2 text-left text-sm font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sampleRows.map((row, index) => (
                    <tr key={index} className="border-t border-gray-200">
                      {headers.map((header) => (
                        <td key={header} className="border border-gray-200 px-3 py-2 text-sm">
                          {row[header] || ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-between">
            <button
              onClick={resetUpload}
              className="bg-gray-100 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-200 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleImport}
              disabled={!fieldMapping.email}
              className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Start Import
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (currentStep === 'import') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="text-4xl mb-4">⏳</div>
            <h2 className="text-xl font-semibold mb-2">Importing Contacts</h2>
            <p className="text-gray-600 mb-4">
              Please wait while we process your CSV file...
            </p>
            
            <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
              <div className="bg-blue-600 h-2 rounded-full animate-pulse"></div>
            </div>

            <div className="text-sm text-gray-500">
              This may take a few minutes for large files
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
} 