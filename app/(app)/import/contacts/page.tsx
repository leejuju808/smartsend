"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { useDropzone } from "react-dropzone";

interface FieldMapping {
  email: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  company?: string;
  title?: string;
  tags?: string;
}

interface ValidationError {
  row: number;
  errors: string[];
  data: Record<string, string>;
}

interface ValidationResult {
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  existingDuplicates: number;
  internalDuplicates: number;
  errors: ValidationError[];
  sampleValid: any[];
}

const STEPS = [
  { id: "upload", title: "Upload CSV", description: "Select your CSV file" },
  { id: "map", title: "Map Columns", description: "Match CSV columns to fields" },
  { id: "validate", title: "Validate", description: "Review validation results" },
  { id: "settings", title: "Settings", description: "Add tags & assign campaign" },
  { id: "import", title: "Import", description: "Importing contacts..." },
  { id: "complete", title: "Complete", description: "Import finished" },
];

export default function ImportContactsPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<any[]>([]);
  const [allRows, setAllRows] = useState<any[]>([]);
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({
    email: "",
  });
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [tags, setTags] = useState<string>("");
  const [campaignId, setCampaignId] = useState<string>("");
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  // Fetch campaigns on mount
  useEffect(() => {
    fetch("/api/campaigns/list")
      .then((res) => res.json())
      .then((data) => {
        if (data.campaigns) {
          setCampaigns(data.campaigns);
        }
      })
      .catch(console.error);
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const csvFile = acceptedFiles[0];
    if (!csvFile) return;

    setFile(csvFile);

    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as any[];
        if (rows.length === 0) {
          alert("CSV file is empty");
          return;
        }

        const detectedHeaders = Object.keys(rows[0]);
        setHeaders(detectedHeaders);
        setSampleRows(rows.slice(0, 50));
        setAllRows(rows);

        // Auto-detect common field mappings
        const autoMapping: FieldMapping = { email: "" };
        detectedHeaders.forEach((header) => {
          const lower = header.toLowerCase();
          if (lower.includes("email") && !autoMapping.email) {
            autoMapping.email = header;
          } else if (lower.includes("first") && lower.includes("name")) {
            autoMapping.first_name = header;
          } else if (lower.includes("last") && lower.includes("name")) {
            autoMapping.last_name = header;
          } else if ((lower.includes("name") || lower === "name") && !autoMapping.name) {
            autoMapping.name = header;
          } else if (lower.includes("phone")) {
            autoMapping.phone = header;
          } else if (lower.includes("address") && !lower.includes("city") && !lower.includes("state")) {
            autoMapping.address = header;
          } else if (lower.includes("city")) {
            autoMapping.city = header;
          } else if (lower.includes("state") || lower === "st") {
            autoMapping.state = header;
          } else if (lower.includes("zip") || lower.includes("postal")) {
            autoMapping.zip = header;
          } else if (lower.includes("company")) {
            autoMapping.company = header;
          } else if (lower.includes("title") || lower.includes("job")) {
            autoMapping.title = header;
          } else if (lower.includes("tag")) {
            autoMapping.tags = header;
          }
        });

        setFieldMapping(autoMapping);
        setCurrentStep(1);
      },
      error: (error) => {
        alert(`Failed to parse CSV: ${error.message}`);
      },
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
    },
    multiple: false,
  });

  const handleValidate = async () => {
    if (!fieldMapping.email) {
      alert("Please select an email column");
      return;
    }

    setCurrentStep(2);
    setImporting(true);

    try {
      const response = await fetch("/api/import/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: allRows,
          fieldMapping,
        }),
      });

      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || "Validation failed");
      }

      setValidationResult(data);
      setImporting(false);
    } catch (error: any) {
      alert(`Validation failed: ${error.message}`);
      setImporting(false);
      setCurrentStep(1);
    }
  };

  const handleImport = async () => {
    if (!validationResult) return;

    setCurrentStep(4);
    setImporting(true);

    try {
      const tagArray = tags
        .split(/[;,]/)
        .map((t) => t.trim())
        .filter(Boolean);

      // Filter out invalid rows based on validation errors
      const validRows = allRows.filter((row, idx) => {
        const rowNum = idx + 1;
        return !validationResult.errors.some((e) => e.row === rowNum);
      });

      const response = await fetch("/api/import/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          validRows,
          fieldMapping,
          tags: tagArray,
          campaignId: campaignId || null,
          filename: file?.name || "import.csv",
        }),
      });

      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || "Import failed");
      }

      setImportResult(data);
      setCurrentStep(5);
    } catch (error: any) {
      alert(`Import failed: ${error.message}`);
      setCurrentStep(3);
    } finally {
      setImporting(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="text-center py-12">
            <div
              {...getRootProps()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-12 hover:border-blue-400 transition-colors cursor-pointer bg-gray-50"
            >
              <input {...getInputProps()} />
              {isDragActive ? (
                <p className="text-lg text-gray-600">Drop the CSV file here...</p>
              ) : (
                <div>
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <p className="mt-4 text-lg font-medium text-gray-900">
                    Drag and drop your CSV file here
                  </p>
                  <p className="mt-2 text-sm text-gray-500">or click to select</p>
                  <p className="mt-1 text-xs text-gray-400">Only CSV files are supported</p>
                </div>
              )}
            </div>
            {file && (
              <p className="mt-4 text-sm text-gray-600">
                Selected: <span className="font-medium">{file.name}</span>
              </p>
            )}
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Column Mapping</h3>
              <p className="text-sm text-gray-600">
                Map your CSV columns to SmartSend contact fields
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email <span className="text-red-500">*</span>
                </label>
                <select
                  value={fieldMapping.email}
                  onChange={(e) =>
                    setFieldMapping({ ...fieldMapping, email: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select column...</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                <select
                  value={fieldMapping.name || ""}
                  onChange={(e) =>
                    setFieldMapping({ ...fieldMapping, name: e.target.value || undefined })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Select column...</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  First Name
                </label>
                <select
                  value={fieldMapping.first_name || ""}
                  onChange={(e) =>
                    setFieldMapping({
                      ...fieldMapping,
                      first_name: e.target.value || undefined,
                    })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Select column...</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                <select
                  value={fieldMapping.last_name || ""}
                  onChange={(e) =>
                    setFieldMapping({
                      ...fieldMapping,
                      last_name: e.target.value || undefined,
                    })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Select column...</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                <select
                  value={fieldMapping.phone || ""}
                  onChange={(e) =>
                    setFieldMapping({ ...fieldMapping, phone: e.target.value || undefined })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Select column...</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                <select
                  value={fieldMapping.address || ""}
                  onChange={(e) =>
                    setFieldMapping({ ...fieldMapping, address: e.target.value || undefined })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Select column...</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                <select
                  value={fieldMapping.city || ""}
                  onChange={(e) =>
                    setFieldMapping({ ...fieldMapping, city: e.target.value || undefined })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Select column...</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
                <select
                  value={fieldMapping.state || ""}
                  onChange={(e) =>
                    setFieldMapping({ ...fieldMapping, state: e.target.value || undefined })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Select column...</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Zip</label>
                <select
                  value={fieldMapping.zip || ""}
                  onChange={(e) =>
                    setFieldMapping({ ...fieldMapping, zip: e.target.value || undefined })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Select column...</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Company</label>
                <select
                  value={fieldMapping.company || ""}
                  onChange={(e) =>
                    setFieldMapping({ ...fieldMapping, company: e.target.value || undefined })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Select column...</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
                <select
                  value={fieldMapping.tags || ""}
                  onChange={(e) =>
                    setFieldMapping({ ...fieldMapping, tags: e.target.value || undefined })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Select column...</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {sampleRows.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-medium text-gray-900 mb-2">
                  Preview (First 5 rows)
                </h4>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="min-w-full text-sm divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {headers.map((header) => (
                          <th
                            key={header}
                            className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {sampleRows.slice(0, 5).map((row, i) => (
                        <tr key={i}>
                          {headers.map((header) => (
                            <td key={header} className="px-3 py-2 text-gray-900">
                              {row[header] || ""}
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
            {importing ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-4 text-gray-600">Validating CSV data...</p>
              </div>
            ) : validationResult ? (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Validation Results</h3>
                  <p className="text-sm text-gray-600">Review the validation summary below</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="text-2xl font-bold text-green-600">
                      {validationResult.validRows}
                    </div>
                    <div className="text-sm text-green-700">Valid Rows</div>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="text-2xl font-bold text-red-600">
                      {validationResult.invalidRows}
                    </div>
                    <div className="text-sm text-red-700">Invalid Rows</div>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="text-2xl font-bold text-yellow-600">
                      {validationResult.duplicateRows}
                    </div>
                    <div className="text-sm text-yellow-700">Duplicates</div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="text-2xl font-bold text-blue-600">
                      {validationResult.existingDuplicates}
                    </div>
                    <div className="text-sm text-blue-700">Already Exist</div>
                  </div>
                </div>

                {validationResult.errors.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">
                      Validation Errors (showing first 20)
                    </h4>
                    <div className="overflow-x-auto border rounded-lg max-h-96 overflow-y-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                              Row
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                              Errors
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                              Email
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {validationResult.errors.slice(0, 20).map((error, i) => (
                            <tr key={i} className="bg-white">
                              <td className="px-3 py-2 text-gray-900">{error.row}</td>
                              <td className="px-3 py-2">
                                <div className="space-y-1">
                                  {error.errors.map((err, j) => (
                                    <div key={j} className="text-red-600 text-xs">
                                      {err}
                                    </div>
                                  ))}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-gray-600">
                                {error.data[fieldMapping.email] || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Import Settings</h3>
              <p className="text-sm text-gray-600">
                Add tags and optionally assign contacts to a campaign
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tags (comma or semicolon separated)
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="roof leak, insurance claim, storm damage 2025"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                These tags will be applied to all imported contacts
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Add to Campaign (Optional)
              </label>
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Do not add to campaign</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name || campaign.id}
                  </option>
                ))}
              </select>
              {campaignId && (
                <p className="mt-1 text-xs text-amber-600">
                  ⚠️ Contacts will immediately enter the campaign sequence
                </p>
              )}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Importing contacts...</p>
            <p className="mt-2 text-sm text-gray-500">This may take a few moments</p>
          </div>
        );

      case 5:
        return (
          <div className="text-center py-12 space-y-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900">Import Complete!</h3>
              {importResult && (
                <div className="mt-4 space-y-2">
                  <p className="text-lg text-gray-700">
                    <span className="font-semibold">{importResult.imported}</span> contacts imported
                    successfully
                  </p>
                  {importResult.skipped > 0 && (
                    <p className="text-sm text-gray-600">
                      {importResult.skipped} contacts skipped (duplicates)
                    </p>
                  )}
                  {tags && (
                    <p className="text-sm text-gray-600">
                      Tags added: <span className="font-medium">{tags}</span>
                    </p>
                  )}
                  {campaignId && (
                    <p className="text-sm text-gray-600">
                      Added to campaign:{" "}
                      <span className="font-medium">
                        {campaigns.find((c) => c.id === campaignId)?.name || campaignId}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => router.push("/contacts")}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                View Contacts
              </button>
              {campaignId && (
                <button
                  onClick={() => router.push(`/campaigns/${campaignId}`)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  Go to Campaign
                </button>
              )}
              <button
                onClick={() => {
                  setCurrentStep(0);
                  setFile(null);
                  setHeaders([]);
                  setSampleRows([]);
                  setAllRows([]);
                  setFieldMapping({ email: "" });
                  setValidationResult(null);
                  setTags("");
                  setCampaignId("");
                  setImportResult(null);
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                Import More
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm p-6 md:p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Import Contacts</h1>
            <p className="mt-2 text-sm text-gray-600">
              Upload a CSV file to import homeowner leads into SmartSend
            </p>
          </div>

          {/* Progress Steps */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {STEPS.map((step, index) => (
                <div key={step.id} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                        index <= currentStep
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "border-gray-300 text-gray-400"
                      }`}
                    >
                      {index < currentStep ? (
                        <svg
                          className="w-6 h-6"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </div>
                    <div className="mt-2 text-center">
                      <p
                        className={`text-xs font-medium ${
                          index <= currentStep ? "text-blue-600" : "text-gray-400"
                        }`}
                      >
                        {step.title}
                      </p>
                    </div>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div
                      className={`h-0.5 flex-1 mx-2 ${
                        index < currentStep ? "bg-blue-600" : "bg-gray-300"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Step Content */}
          <div className="mb-8">{renderStep()}</div>

          {/* Navigation */}
          {currentStep < 5 && (
            <div className="flex justify-between border-t pt-6">
              <button
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0 || importing}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>

              <div className="space-x-2">
                {currentStep === 0 && file && (
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Next
                  </button>
                )}
                {currentStep === 1 && (
                  <button
                    onClick={handleValidate}
                    disabled={!fieldMapping.email || importing}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Validate
                  </button>
                )}
                {currentStep === 2 && validationResult && (
                  <button
                    onClick={() => setCurrentStep(3)}
                    disabled={importing}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                  </button>
                )}
                {currentStep === 3 && (
                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Start Import
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

