"use client";
import { useState, useRef } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, X, Users, Trash2 } from "lucide-react";

interface ImportedContact {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  phone?: string;
  custom_fields?: Record<string, string>;
  status: 'new' | 'duplicate' | 'suppressed' | 'error';
  error_message?: string;
}

interface ImportStats {
  total: number;
  new: number;
  duplicates: number;
  suppressed: number;
  errors: number;
}

export default function CSVImportDedupe() {
  const [file, setFile] = useState<File | null>(null);
  const [contacts, setContacts] = useState<ImportedContact[]>([]);
  const [stats, setStats] = useState<ImportStats>({
    total: 0,
    new: 0,
    duplicates: 0,
    suppressed: 0,
    errors: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'complete'>('upload');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      setError('Please upload a CSV file');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setLoading(true);

    try {
      const text = await selectedFile.text();
      const parsed = parseCSV(text);
      const processed = await processContacts(parsed);
      
      setContacts(processed);
      calculateStats(processed);
      setStep('preview');
    } catch (err) {
      console.error('Error processing CSV:', err);
      setError('Failed to process CSV file');
    } finally {
      setLoading(false);
    }
  };

  const parseCSV = (text: string): Record<string, string>[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) throw new Error('CSV must have at least a header and one data row');

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      if (values.length !== headers.length) continue;

      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header.toLowerCase()] = values[index] || '';
      });
      rows.push(row);
    }

    return rows;
  };

  const processContacts = async (rows: Record<string, string>[]): Promise<ImportedContact[]> => {
    const processed: ImportedContact[] = [];
    const emailSet = new Set<string>();
    const suppressedEmails = new Set(['test@example.com', 'noreply@example.com']); // In real app, fetch from suppression list

    for (const row of rows) {
      const email = row.email?.toLowerCase().trim();
      if (!email) {
        processed.push({
          id: Math.random().toString(36),
          email: '',
          status: 'error',
          error_message: 'Email is required'
        });
        continue;
      }

      // Check for duplicates within the import
      if (emailSet.has(email)) {
        processed.push({
          id: Math.random().toString(36),
          email,
          first_name: row.first_name,
          last_name: row.last_name,
          company: row.company,
          phone: row.phone,
          status: 'duplicate'
        });
        continue;
      }

      // Check against suppression list
      if (suppressedEmails.has(email)) {
        processed.push({
          id: Math.random().toString(36),
          email,
          first_name: row.first_name,
          last_name: row.last_name,
          company: row.company,
          phone: row.phone,
          status: 'suppressed'
        });
        continue;
      }

      // Valid new contact
      emailSet.add(email);
      processed.push({
        id: Math.random().toString(36),
        email,
        first_name: row.first_name,
        last_name: row.last_name,
        company: row.company,
        phone: row.phone,
        status: 'new'
      });
    }

    return processed;
  };

  const calculateStats = (contacts: ImportedContact[]) => {
    const stats: ImportStats = {
      total: contacts.length,
      new: contacts.filter(c => c.status === 'new').length,
      duplicates: contacts.filter(c => c.status === 'duplicate').length,
      suppressed: contacts.filter(c => c.status === 'suppressed').length,
      errors: contacts.filter(c => c.status === 'error').length
    };
    setStats(stats);
  };

  const handleImport = async () => {
    setLoading(true);
    setStep('importing');

    try {
      // In real app, this would call the API to import contacts
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API call
      
      setStep('complete');
    } catch (err) {
      console.error('Error importing contacts:', err);
      setError('Failed to import contacts');
      setStep('preview');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: ImportedContact['status']) => {
    switch (status) {
      case 'new':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'duplicate':
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      case 'suppressed':
        return <X className="h-4 w-4 text-red-600" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
    }
  };

  const getStatusColor = (status: ImportedContact['status']) => {
    switch (status) {
      case 'new':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'duplicate':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'suppressed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200';
    }
  };

  const reset = () => {
    setFile(null);
    setContacts([]);
    setStats({ total: 0, new: 0, duplicates: 0, suppressed: 0, errors: 0 });
    setError(null);
    setStep('upload');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">CSV Import & Dedupe</h2>
        <p className="text-gray-600 mt-1">
          Import contacts with automatic deduplication and suppression checking
        </p>
      </div>

      {/* Upload Step */}
      {step === 'upload' && (
        <div className="bg-white rounded-lg border p-6">
          <div className="text-center">
            <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Upload CSV File</h3>
            <p className="text-gray-600 mb-4">
              Upload a CSV file with your contacts. We'll automatically check for duplicates and suppressions.
            </p>
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Processing...' : 'Choose CSV File'}
            </button>
            
            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <span className="text-sm text-red-800">{error}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Preview Step */}
      {step === 'preview' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white rounded-lg border p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-sm text-gray-600">Total</div>
            </div>
            <div className="bg-white rounded-lg border p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.new}</div>
              <div className="text-sm text-gray-600">New</div>
            </div>
            <div className="bg-white rounded-lg border p-4 text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.duplicates}</div>
              <div className="text-sm text-gray-600">Duplicates</div>
            </div>
            <div className="bg-white rounded-lg border p-4 text-center">
              <div className="text-2xl font-bold text-red-600">{stats.suppressed}</div>
              <div className="text-sm text-gray-600">Suppressed</div>
            </div>
            <div className="bg-white rounded-lg border p-4 text-center">
              <div className="text-2xl font-bold text-red-600">{stats.errors}</div>
              <div className="text-sm text-gray-600">Errors</div>
            </div>
          </div>

          {/* Contacts List */}
          <div className="bg-white rounded-lg border">
            <div className="p-4 border-b">
              <h3 className="text-lg font-medium text-gray-900">Contact Preview</h3>
              <p className="text-sm text-gray-600">Review contacts before importing</p>
            </div>
            
            <div className="max-h-96 overflow-y-auto">
              {contacts.map((contact) => (
                <div key={contact.id} className="p-4 border-b last:border-b-0 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-1">
                        <span className="font-medium text-gray-900">
                          {contact.first_name && contact.last_name 
                            ? `${contact.first_name} ${contact.last_name}`
                            : contact.email
                          }
                        </span>
                        <span className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs border ${getStatusColor(contact.status)}`}>
                          {getStatusIcon(contact.status)}
                          <span className="capitalize">{contact.status}</span>
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {contact.email}
                        {contact.company && ` • ${contact.company}`}
                        {contact.phone && ` • ${contact.phone}`}
                      </div>
                      {contact.error_message && (
                        <div className="text-xs text-red-600 mt-1">{contact.error_message}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between">
            <button
              onClick={reset}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
            >
              Upload Different File
            </button>
            
            <div className="flex space-x-2">
              <button
                onClick={handleImport}
                disabled={loading || stats.new === 0}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Importing...' : `Import ${stats.new} New Contacts`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Importing Step */}
      {step === 'importing' && (
        <div className="bg-white rounded-lg border p-6 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Importing Contacts</h3>
          <p className="text-gray-600">Please wait while we import your contacts...</p>
        </div>
      )}

      {/* Complete Step */}
      {step === 'complete' && (
        <div className="bg-white rounded-lg border p-6 text-center">
          <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Import Complete!</h3>
          <p className="text-gray-600 mb-4">
            Successfully imported {stats.new} new contacts. {stats.duplicates} duplicates and {stats.suppressed} suppressed contacts were skipped.
          </p>
          <button
            onClick={reset}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Import More Contacts
          </button>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-2">CSV Format Requirements</h3>
        <div className="text-sm text-blue-800 space-y-2">
          <p><strong>Required columns:</strong> email</p>
          <p><strong>Optional columns:</strong> first_name, last_name, company, phone</p>
          <p><strong>Format:</strong> CSV with headers in the first row</p>
          <p><strong>Example:</strong></p>
          <pre className="bg-blue-100 p-2 rounded text-xs mt-2">
{`email,first_name,last_name,company,phone
john@example.com,John,Doe,Acme Corp,555-0123
jane@example.com,Jane,Smith,Tech Inc,555-0456`}
          </pre>
        </div>
      </div>
    </div>
  );
}