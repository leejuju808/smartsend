"use client";

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

interface ImportWizardProps {
  onClose: () => void;
  onImportComplete: () => void;
}

interface FieldMapping {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
  phone?: string;
  custom?: string[];
}

interface ImportStep {
  id: string;
  title: string;
  description: string;
}

const STEPS: ImportStep[] = [
  {
    id: 'upload',
    title: 'Upload CSV',
    description: 'Drag and drop your CSV file to get started'
  },
  {
    id: 'map',
    title: 'Map Fields',
    description: 'Tell us which columns contain what information'
  },
  {
    id: 'commit',
    title: 'Import & Dedupe',
    description: 'Review settings and start the import process'
  }
];

export function ImportWizard({ onClose, onImportComplete }: ImportWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [importId, setImportId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<any[]>([]);
  const [mapping, setMapping] = useState<FieldMapping>({
    email: '',
    first_name: '',
    last_name: '',
    company: '',
    title: '',
    phone: '',
    custom: []
  });
  const [settings, setSettings] = useState({
    onConflict: 'skip' as 'skip' | 'update',
    respectSuppression: true
  });
  const [importStatus, setImportStatus] = useState<string>('');
  const [importProgress, setImportProgress] = useState<any>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setFile(file);

    try {
      // Upload file
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/imports/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      setImportId(data.importId);

      // Get preview data
      const previewResponse = await fetch(`/api/imports/${data.importId}/preview`);
      if (previewResponse.ok) {
        const previewData = await previewResponse.json();
        setHeaders(previewData.headersDetected);
        setSampleRows(previewData.sampleRows);

        // Auto-map common fields
        const autoMapping: FieldMapping = { email: '' };
        previewData.headersDetected.forEach((header: string) => {
          const lowerHeader = header.toLowerCase();
          if (lowerHeader.includes('email')) autoMapping.email = header;
          else if (lowerHeader.includes('first') || lowerHeader.includes('name')) autoMapping.first_name = header;
          else if (lowerHeader.includes('last')) autoMapping.last_name = header;
          else if (lowerHeader.includes('company')) autoMapping.company = header;
          else if (lowerHeader.includes('title') || lowerHeader.includes('job')) autoMapping.title = header;
          else if (lowerHeader.includes('phone')) autoMapping.phone = header;
        });

        setMapping(autoMapping);
      }

      setCurrentStep(1);
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed. Please try again.');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv']
    },
    multiple: false
  });

  const handleCommit = async () => {
    if (!importId) return;

    try {
      setImportStatus('Starting import...');
      setCurrentStep(2);

      const response = await fetch(`/api/imports/${importId}/commit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mapping,
          dedupeStrategy: 'email',
          onConflict: settings.onConflict,
          respectSuppression: settings.respectSuppression
        })
      });

      if (!response.ok) {
        throw new Error('Import failed');
      }

      // Poll for status
      const pollStatus = async () => {
        const statusResponse = await fetch(`/api/imports/${importId}`);
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          setImportProgress(statusData);

          if (statusData.status === 'done') {
            setImportStatus('Import completed successfully!');
            setTimeout(() => {
              onImportComplete();
            }, 2000);
          } else if (statusData.status === 'failed') {
            setImportStatus(`Import failed: ${statusData.error}`);
          } else {
            // Still processing, poll again
            setTimeout(pollStatus, 2000);
          }
        }
      };

      pollStatus();

    } catch (error) {
      console.error('Commit error:', error);
      setImportStatus('Import failed. Please try again.');
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="text-center">
            <div {...getRootProps()} className="border-2 border-dashed border-gray-300 rounded-lg p-12 hover:border-gray-400 transition-colors cursor-pointer">
              <input {...getInputProps()} />
              {isDragActive ? (
                <p className="text-lg text-gray-600">Drop the CSV file here...</p>
              ) : (
                <div>
                  <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="mt-4 text-lg text-gray-600">
                    Drag and drop your CSV file here, or click to select
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    Only CSV files are supported
                  </p>
                </div>
              )}
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Field Mapping</h3>
              <p className="text-sm text-gray-600">Map your CSV columns to contact fields</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email * (Required)
                </label>
                <select
                  value={mapping.email}
                  onChange={(e) => setMapping({ ...mapping, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  required
                >
                  <option value="">Select column...</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  First Name
                </label>
                <select
                  value={mapping.first_name || ''}
                  onChange={(e) => setMapping({ ...mapping, first_name: e.target.value || undefined })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Select column...</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Last Name
                </label>
                <select
                  value={mapping.last_name || ''}
                  onChange={(e) => setMapping({ ...mapping, last_name: e.target.value || undefined })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Select column...</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company
                </label>
                <select
                  value={mapping.company || ''}
                  onChange={(e) => setMapping({ ...mapping, company: e.target.value || undefined })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Select column...</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </div>
            </div>

            {sampleRows.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">Preview (First 5 rows)</h4>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {headers.map((header) => (
                          <th key={header} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sampleRows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-t">
                          {headers.map((header) => (
                            <td key={header} className="px-3 py-2 text-gray-900">
                              {row[header] || ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Import Settings</h3>
              <p className="text-sm text-gray-600">Configure how to handle duplicates and suppression</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="skip"
                    checked={settings.onConflict === 'skip'}
                    onChange={(e) => setSettings({ ...settings, onConflict: e.target.value as 'skip' | 'update' })}
                    className="mr-2"
                  />
                  Skip duplicates (recommended for large imports)
                </label>
                <label className="flex items-center mt-2">
                  <input
                    type="radio"
                    value="update"
                    checked={settings.onConflict === 'update'}
                    onChange={(e) => setSettings({ ...settings, onConflict: e.target.value as 'skip' | 'update' })}
                    className="mr-2"
                  />
                  Update existing contacts with new data
                </label>
              </div>

              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.respectSuppression}
                    onChange={(e) => setSettings({ ...settings, respectSuppression: e.target.checked })}
                    className="mr-2"
                  />
                  Respect suppression list (skip emails that have unsubscribed)
                </label>
              </div>
            </div>

            {importStatus && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <p className="text-blue-800">{importStatus}</p>
                {importProgress && (
                  <div className="mt-2 text-sm text-blue-600">
                    <p>Total rows: {importProgress.total_rows || 0}</p>
                    <p>Inserted: {importProgress.inserted_rows || 0}</p>
                    <p>Skipped: {importProgress.skipped_rows || 0}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Import Contacts</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                index <= currentStep ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {index + 1}
              </div>
              <div className="ml-2">
                <p className={`text-sm font-medium ${
                  index <= currentStep ? 'text-blue-600' : 'text-gray-500'
                }`}>
                  {step.title}
                </p>
                <p className="text-xs text-gray-400">{step.description}</p>
              </div>
              {index < STEPS.length - 1 && (
                <div className={`w-16 h-0.5 mx-4 ${
                  index < currentStep ? 'bg-blue-600' : 'bg-gray-200'
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        {renderStep()}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>

          <div className="space-x-2">
            {currentStep < STEPS.length - 1 ? (
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                disabled={currentStep === 0 && !file}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleCommit}
                disabled={!mapping.email || importStatus === 'Import completed successfully!'}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Start Import
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 