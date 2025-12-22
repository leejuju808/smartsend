"use client";
import { useState, useEffect } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, Info, Download, Users, Shield, RefreshCw } from "lucide-react";
import { createClientComponentClient } from "@/lib/supabase";
import Link from "next/link";

type ImportSummary = {
  total_in_file: number;
  valid_emails: number;
  invalid_emails: number;
  unique_after_dedup: number;
  existing_skipped: number;
  suppressed_skipped: number;
  inserted: number;
};

type Contact = {
  id: string;
  email: string;
  name?: string;
  company?: string;
  tags: string[];
  unsubscribed?: boolean;
  created_at: string;
};

type Suppression = {
  id: string;
  email: string;
  reason?: string;
  created_at: string;
};

export default function CSVImportPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [loading, setLoading] = useState(true);
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [addingTag, setAddingTag] = useState("");
  const [newSuppression, setNewSuppression] = useState({ email: "", reason: "" });
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Load contacts
      const contactsResponse = await fetch("/api/contacts/list");
      if (contactsResponse.ok) {
        const contactsData = await contactsResponse.json();
        setContacts(contactsData.items || []);
      }

      // Load suppressions
      const suppressionsResponse = await fetch("/api/contacts/suppression");
      if (suppressionsResponse.ok) {
        const suppressionsData = await suppressionsResponse.json();
        setSuppressions(suppressionsData.rows || []);
      }
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "text/csv" || file.name.endsWith('.csv')) {
        handleFileSelect(file);
      } else {
        setError("Please select a CSV file");
      }
    }
  };

  const handleFileSelect = async (file: File) => {
    setFileName(file.name);
    setError(null);
    setImportResult(null);
    
    // Parse CSV for preview
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      setPreviewData(rows.slice(0, 10)); // Show first 10 rows
      setShowPreview(true);
    } catch (err) {
      setError("Failed to parse CSV file");
    }
  };

  const parseCSV = (csvText: string) => {
    const lines = csvText.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows = [];
    
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        rows.push(row);
      }
    }
    
    return rows;
  };

  const importCSV = async () => {
    const fileInput = document.getElementById('csv-file') as HTMLInputElement;
    const file = fileInput?.files?.[0];
    if (!file) {
      setError("Please select a CSV file");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (addingTag.trim()) {
        formData.append("addTag", addingTag.trim());
      }

      const response = await fetch("/api/contacts/import", { 
        method: "POST", 
        body: formData 
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Import failed");
      }

      const data = await response.json();
      setImportResult(data);
      setSuccess(`Successfully imported ${data.inserted} contacts!`);
      
      // Refresh data
      await loadData();
      
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const addSuppression = async () => {
    if (!newSuppression.email.trim()) {
      setError("Email is required");
      return;
    }

    try {
      const response = await fetch("/api/suppression/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newSuppression.email.trim(),
          reason: newSuppression.reason.trim() || null
        })
      });

      if (response.ok) {
        setSuccess("Email added to suppression list");
        setNewSuppression({ email: "", reason: "" });
        await loadData();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to add suppression");
      }
    } catch (err: any) {
      setError(err.message || "Failed to add suppression");
    }
  };

  const removeSuppression = async (email: string) => {
    try {
      const response = await fetch("/api/suppression/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      if (response.ok) {
        setSuccess("Email removed from suppression list");
        await loadData();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to remove suppression");
      }
    } catch (err: any) {
      setError(err.message || "Failed to remove suppression");
    }
  };

  const resetForm = () => {
    setFileName("");
    setAddingTag("");
    setImportResult(null);
    setError(null);
    setShowPreview(false);
    setPreviewData([]);
    const fileInput = document.getElementById('csv-file') as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">📊 CSV Import & Contact Management</h1>
        <p className="text-gray-600">
          Upload your contact lists, automatically dedupe, and manage your suppression list to scale your outbound campaigns
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{contacts.length}</div>
              <div className="text-sm text-gray-600">Total Contacts</div>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl border p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-100 rounded-lg">
              <Shield className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{suppressions.length}</div>
              <div className="text-sm text-gray-600">Suppressed Emails</div>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl border p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{contacts.filter(c => !c.unsubscribed).length}</div>
              <div className="text-sm text-gray-600">Active Contacts</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CSV Import Section */}
        <div className="bg-white rounded-2xl border p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Upload className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Import Contacts</h3>
              <p className="text-sm text-gray-600">Upload CSV files with automatic dedupe & validation</p>
            </div>
          </div>

          {/* Download Template */}
          <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-gray-900 mb-1">Need a template?</h4>
                <p className="text-sm text-gray-600">Download our CSV template to see the expected format</p>
              </div>
              <a
                href="/contacts_template.csv"
                download
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
              >
                <Download className="h-4 w-4" />
                Download Template
              </a>
            </div>
          </div>

          {/* Drag & Drop Zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              dragActive 
                ? "border-blue-400 bg-blue-50" 
                : "border-gray-300 hover:border-gray-400"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleFileSelect(file);
                }
              }}
            />
            
            {!fileName ? (
              <div className="space-y-3">
                <Upload className="h-12 w-12 text-gray-400 mx-auto" />
                <div>
                  <p className="text-lg font-medium text-gray-900">
                    Drop your CSV file here, or{" "}
                    <button
                      type="button"
                      onClick={() => document.getElementById('csv-file')?.click()}
                      className="text-blue-600 hover:text-blue-500 font-medium"
                    >
                      browse
                    </button>
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Supports CSV files with email, first_name, last_name, company columns
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <FileText className="h-12 w-12 text-green-500 mx-auto" />
                <div>
                  <p className="text-lg font-medium text-gray-900">{fileName}</p>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-sm text-gray-500 hover:text-gray-700 mt-1"
                  >
                    Choose different file
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* CSV Preview */}
          {showPreview && previewData.length > 0 && (
            <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
              <h4 className="font-medium text-gray-900 mb-3">CSV Preview (First 10 rows)</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      {Object.keys(previewData[0]).map(header => (
                        <th key={header} className="text-left py-2 px-2 font-medium text-gray-700">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, index) => (
                      <tr key={index} className="border-b">
                        {Object.values(row).map((value, i) => (
                          <td key={i} className="py-2 px-2 text-gray-600">
                            {String(value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tag Input */}
          {fileName && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Add tag to all contacts (optional)
              </label>
              <input
                value={addingTag}
                onChange={(e) => setAddingTag(e.target.value)}
                placeholder="e.g., leads, trial, imported-2025"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Import Button */}
          {fileName && (
            <button
              disabled={loading}
              onClick={importCSV}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Importing...
                </div>
              ) : (
                "Import Contacts"
              )}
            </button>
          )}

          {/* Import Results */}
          {importResult && (
            <div className="rounded-lg border border-gray-200 p-6 bg-gray-50">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <h4 className="text-lg font-semibold text-gray-900">Import Complete!</h4>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="text-center p-3 bg-white rounded-lg border">
                  <div className="text-2xl font-bold text-green-600">{importResult.inserted}</div>
                  <div className="text-sm text-gray-600">Successfully Imported</div>
                </div>
                
                <div className="text-center p-3 bg-white rounded-lg border">
                  <div className="text-2xl font-bold text-blue-600">{importResult.total_in_file}</div>
                  <div className="text-sm text-gray-600">Total in File</div>
                </div>
                
                <div className="text-center p-3 bg-white rounded-lg border">
                  <div className="text-2xl font-bold text-orange-600">{importResult.unique_after_dedup}</div>
                  <div className="text-sm text-gray-600">Unique Emails</div>
                </div>
              </div>

              <div className="mt-4 space-y-2 text-sm text-gray-600">
                {importResult.existing_skipped > 0 && (
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-blue-500" />
                    <span>{importResult.existing_skipped} emails already existed and were skipped</span>
                  </div>
                )}
                {importResult.suppressed_skipped > 0 && (
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-orange-500" />
                    <span>{importResult.suppressed_skipped} emails were suppressed and skipped</span>
                  </div>
                )}
                {importResult.invalid_emails > 0 && (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    <span>{importResult.invalid_emails} emails were invalid and skipped</span>
                  </div>
                )}
              </div>

              <button
                onClick={resetForm}
                className="mt-4 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Import Another File
              </button>
            </div>
          )}
        </div>

        {/* Suppression List Section */}
        <div className="bg-white rounded-2xl border p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Shield className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Suppression List</h3>
              <p className="text-sm text-gray-600">
                Manage emails that should not receive any communications
              </p>
            </div>
          </div>

          {/* Add New Suppression */}
          <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
            <h4 className="font-medium text-gray-900 mb-3">Add Email to Suppression List</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={newSuppression.email}
                  onChange={(e) => setNewSuppression(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="example@domain.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason (optional)
                </label>
                <input
                  type="text"
                  value={newSuppression.reason}
                  onChange={(e) => setNewSuppression(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="e.g., unsubscribed, bounced, requested removal"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
              <button
                onClick={addSuppression}
                disabled={!newSuppression.email.trim()}
                className="rounded-lg bg-orange-600 px-4 py-2 text-white font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add to Suppression List
              </button>
            </div>
          </div>

          {/* Suppression List */}
          <div>
            <h4 className="font-medium text-gray-900 mb-3">
              Current Suppressions ({suppressions.length})
            </h4>
            
            {suppressions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Shield className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p>No suppressions yet</p>
                <p className="text-sm">Add emails above to prevent them from receiving communications</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {suppressions.map((suppression) => (
                  <div
                    key={suppression.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{suppression.email}</div>
                      {suppression.reason && (
                        <div className="text-sm text-gray-600 mt-1">
                          Reason: {suppression.reason}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">
                        Added: {new Date(suppression.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => removeSuppression(suppression.email)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove from suppression list"
                    >
                      <AlertCircle className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
            <div className="flex items-start gap-2">
              <div className="p-1 bg-blue-100 rounded">
                <Info className="h-4 w-4 text-blue-600" />
              </div>
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">How Suppressions Work</p>
                <ul className="space-y-1 text-blue-700">
                  <li>• Suppressed emails are automatically skipped during contact imports</li>
                  <li>• They won't receive any campaigns or sequences</li>
                  <li>• You can remove emails from suppression at any time</li>
                  <li>• Common reasons: unsubscribed, bounced, requested removal</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-red-800">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
              <span className="text-white text-xs">✓</span>
            </div>
            <p className="text-green-800">{success}</p>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl border p-6">
        <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/dashboard/contacts"
            className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
          >
            <Users className="h-5 w-5 text-blue-600" />
            <div>
              <div className="font-medium">View All Contacts</div>
              <div className="text-sm text-gray-600">Browse and manage your contact list</div>
            </div>
          </Link>
          
          <Link
            href="/dashboard/campaigns/new"
            className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors"
          >
            <FileText className="h-5 w-5 text-green-600" />
            <div>
              <div className="font-medium">Create Campaign</div>
              <div className="text-sm text-gray-600">Send emails to your contacts</div>
            </div>
          </Link>
          
          <Link
            href="/dashboard/analytics"
            className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-colors"
          >
            <CheckCircle className="h-5 w-5 text-purple-600" />
            <div>
              <div className="font-medium">View Analytics</div>
              <div className="text-sm text-gray-600">Track campaign performance</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
} 