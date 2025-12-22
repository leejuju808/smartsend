"use client";

import { useState } from 'react';
import { UploadCsv } from '@/components/contacts/UploadCsv';
import { ContactsTable } from '@/components/contacts/ContactsTable';

export default function ContactsPage() {
  const [showUploadCsv, setShowUploadCsv] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [showImportSummary, setShowImportSummary] = useState(false);

  // For demo purposes - replace with actual workspace ID from your auth system
  const demoWorkspaceId = process.env.NEXT_PUBLIC_DEMO_WORKSPACE_ID || 'demo-workspace-id';

  const handleImportComplete = (result: any) => {
    setImportResult(result);
    setShowImportSummary(true);
    setShowUploadCsv(false);
    // Refresh the contacts table
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-gray-600">Manage your contact list and import new contacts</p>
        </div>
        <button
          onClick={() => setShowUploadCsv(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
        >
          Import CSV
        </button>
      </div>

      {showUploadCsv && (
        <UploadCsv
          workspaceId={demoWorkspaceId}
          onImportComplete={handleImportComplete}
          onClose={() => setShowUploadCsv(false)}
        />
      )}

      {showImportSummary && importResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="text-center">
              <div className="text-4xl mb-4">✅</div>
              <h2 className="text-xl font-semibold mb-4">Import Complete!</h2>
              
              <div className="space-y-2 text-left mb-6">
                <div className="flex justify-between">
                  <span>Total Rows:</span>
                  <span className="font-medium">{importResult.summary.totalRows}</span>
                </div>
                <div className="flex justify-between">
                  <span>Valid Rows:</span>
                  <span className="font-medium">{importResult.summary.validRows}</span>
                </div>
                <div className="flex justify-between">
                  <span>Inserted:</span>
                  <span className="font-medium text-green-600">{importResult.summary.inserted}</span>
                </div>
                <div className="flex justify-between">
                  <span>Duplicates:</span>
                  <span className="font-medium text-yellow-600">{importResult.summary.duplicates}</span>
                </div>
                <div className="flex justify-between">
                  <span>Suppressed:</span>
                  <span className="font-medium text-red-600">{importResult.summary.suppressed}</span>
                </div>
                <div className="flex justify-between">
                  <span>Errors:</span>
                  <span className="font-medium text-red-600">{importResult.summary.errors}</span>
                </div>
              </div>

              {importResult.parseErrors.length > 0 && (
                <div className="mb-4 text-left">
                  <h3 className="font-medium text-red-600 mb-2">Parse Errors:</h3>
                  <div className="text-sm text-red-600 max-h-20 overflow-y-auto">
                    {importResult.parseErrors.map((error: string, index: number) => (
                      <div key={index}>{error}</div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => setShowImportSummary(false)}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <ContactsTable />
    </div>
  );
}
 

