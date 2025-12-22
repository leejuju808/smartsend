"use client";

// Block 10800 — SmartSend Roofing Contact Loader v1
// ImportContactsModal - Simple homeowner import with neighborhood tagging

import React, { useState, useMemo } from "react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/use-toast";

type ContactRow = {
  email: string;
  first_name?: string;
  last_name?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
};

type ImportMode = "csv" | "paste" | "single";

export function ImportContactsModal({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const [mode, setMode] = useState<ImportMode>("csv");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvMapping, setCsvMapping] = useState<Record<string, string | null>>({
    email: null,
    first_name: null,
    last_name: null,
    street: null,
    city: null,
    state: null,
    zip: null,
  });
  const [pasteText, setPasteText] = useState("");
  const [singleContact, setSingleContact] = useState<ContactRow>({
    email: "",
    first_name: "",
    last_name: "",
    street: "",
    city: "",
    state: "",
    zip: "",
  });
  const [listName, setListName] = useState("");
  const [existingListId, setExistingListId] = useState<string | null>(null);
  const [existingLists, setExistingLists] = useState<Array<{ id: string; name: string; contact_count: number }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  // Load existing lists on mount
  React.useEffect(() => {
    if (open) {
      fetch("/api/lists")
        .then((res) => res.json())
        .then((data) => {
          if (data.lists) {
            setExistingLists(data.lists);
          }
        })
        .catch((err) => console.error("Failed to load lists:", err));
    }
  }, [open]);

  const hasRequiredMapping = useMemo(() => {
    return csvMapping.email !== null;
  }, [csvMapping]);

  function handleCsvFile(file: File) {
    setCsvFile(file);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = (results.meta.fields ?? []).map((h) => String(h));
        setCsvHeaders(headers);
        const rows = results.data.map((r: any) =>
          Object.fromEntries(headers.map((h) => [h, r[h] ?? ""]))
        );
        setCsvRows(rows);

        // Auto-map headers
        const lower = headers.map((h) => h.toLowerCase());
        const find = (keys: string[]) => {
          for (const key of keys) {
            const i = lower.indexOf(key);
            if (i !== -1) return headers[i];
          }
          return null;
        };
        setCsvMapping({
          email: find(["email", "e-mail", "work_email"]) || null,
          first_name: find(["first_name", "firstname", "first name"]) || null,
          last_name: find(["last_name", "lastname", "last name"]) || null,
          street: find(["street", "address"]) || null,
          city: find(["city"]) || null,
          state: find(["state"]) || null,
          zip: find(["zip", "zip code", "zipcode"]) || null,
        });
      },
      error: (err) => {
        toast({
          variant: "destructive",
          title: "CSV parse failed",
          description: String(err),
        });
      },
    });
  }

  function parsePasteText(): ContactRow[] {
    if (!pasteText.trim()) return [];

    const lines = pasteText.trim().split("\n");
    const contacts: ContactRow[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Try to parse as CSV line
      const parts = trimmed.split(",").map((p) => p.trim());
      if (parts.length >= 1 && parts[0].includes("@")) {
        contacts.push({
          email: parts[0],
          first_name: parts[1] || undefined,
          last_name: parts[2] || undefined,
          city: parts[3] || undefined,
          zip: parts[4] || undefined,
        });
      } else if (trimmed.includes("@")) {
        // Single email per line
        contacts.push({ email: trimmed });
      }
    }

    return contacts;
  }

  async function handleImport() {
    let contactsToImport: ContactRow[] = [];

    // Collect contacts based on mode
    if (mode === "csv") {
      if (!csvFile || csvRows.length === 0 || !hasRequiredMapping) {
        toast({
          variant: "destructive",
          title: "Invalid CSV",
          description: "Please upload a CSV file and map the email column.",
        });
        return;
      }
      contactsToImport = csvRows.map((row) => ({
        email: csvMapping.email ? row[csvMapping.email] : "",
        first_name: csvMapping.first_name ? row[csvMapping.first_name] : undefined,
        last_name: csvMapping.last_name ? row[csvMapping.last_name] : undefined,
        street: csvMapping.street ? row[csvMapping.street] : undefined,
        city: csvMapping.city ? row[csvMapping.city] : undefined,
        state: csvMapping.state ? row[csvMapping.state] : undefined,
        zip: csvMapping.zip ? row[csvMapping.zip] : undefined,
      }));
    } else if (mode === "paste") {
      contactsToImport = parsePasteText();
      if (contactsToImport.length === 0) {
        toast({
          variant: "destructive",
          title: "No contacts found",
          description: "Please paste emails (one per line or CSV format).",
        });
        return;
      }
    } else if (mode === "single") {
      if (!singleContact.email || !singleContact.email.includes("@")) {
        toast({
          variant: "destructive",
          title: "Invalid email",
          description: "Please enter a valid email address.",
        });
        return;
      }
      contactsToImport = [singleContact];
    }

    if (contactsToImport.length === 0) {
      return;
    }

    // Validate we have a list name or existing list
    if (!listName.trim() && !existingListId) {
      toast({
        variant: "destructive",
        title: "List required",
        description: "Please select an existing list or create a new one.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacts: contactsToImport,
          listName: listName.trim() || undefined,
          listId: existingListId || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Import failed");
      }

      toast({
        title: "Import successful",
        description: `${data.inserted} contact${data.inserted !== 1 ? "s" : ""} imported successfully.`,
      });

      // Reset form
      setCsvFile(null);
      setCsvHeaders([]);
      setCsvRows([]);
      setPasteText("");
      setSingleContact({
        email: "",
        first_name: "",
        last_name: "",
        street: "",
        city: "",
        state: "",
        zip: "",
      });
      setListName("");
      setExistingListId(null);
      setMode("csv");

      onSuccess?.();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Import failed",
        description: err.message || String(err),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Homeowners</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Import Method Tabs */}
          <div className="flex gap-2 border-b">
            <button
              onClick={() => setMode("csv")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                mode === "csv"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Upload CSV
            </button>
            <button
              onClick={() => setMode("paste")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                mode === "paste"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Paste Emails
            </button>
            <button
              onClick={() => setMode("single")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                mode === "single"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Add One Contact
            </button>
          </div>

          {/* CSV Upload */}
          {mode === "csv" && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Upload CSV File</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleCsvFile(file);
                  }}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Format: email,first_name,last_name,street,city,state,zip
                </p>
              </div>

              {csvHeaders.length > 0 && (
                <>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Map Columns</label>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { key: "email", label: "Email", required: true },
                        { key: "first_name", label: "First Name", required: false },
                        { key: "last_name", label: "Last Name", required: false },
                        { key: "street", label: "Street", required: false },
                        { key: "city", label: "City", required: false },
                        { key: "state", label: "State", required: false },
                        { key: "zip", label: "ZIP", required: false },
                      ].map((field) => (
                        <div key={field.key} className="space-y-1">
                          <label className="text-xs">
                            {field.label}
                            {field.required && <span className="text-red-500"> *</span>}
                          </label>
                          <select
                            value={csvMapping[field.key] || ""}
                            onChange={(e) =>
                              setCsvMapping((m) => ({ ...m, [field.key]: e.target.value || null }))
                            }
                            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                          >
                            <option value="">Select column...</option>
                            {csvHeaders.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  {csvRows.length > 0 && (
                    <div className="border rounded p-3 max-h-48 overflow-auto text-xs">
                      <div className="font-medium mb-2">Preview ({csvRows.length} rows)</div>
                      <div className="space-y-1">
                        {csvRows.slice(0, 5).map((row, i) => (
                          <div key={i} className="grid grid-cols-4 gap-2 border-b py-1">
                            <div>{csvMapping.email ? row[csvMapping.email] : ""}</div>
                            <div>{csvMapping.first_name ? row[csvMapping.first_name] : ""}</div>
                            <div>{csvMapping.city ? row[csvMapping.city] : ""}</div>
                            <div>{csvMapping.zip ? row[csvMapping.zip] : ""}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Paste Emails */}
          {mode === "paste" && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Paste Emails</label>
                <Textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="jane@example.com,Jane,Spokane,99201&#10;john@example.com,John,Seattle,98101"
                  rows={8}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  One per line, or CSV format: email,first_name,city,zip
                </p>
              </div>
            </div>
          )}

          {/* Single Contact */}
          {mode === "single" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="email"
                    value={singleContact.email}
                    onChange={(e) =>
                      setSingleContact((c) => ({ ...c, email: e.target.value }))
                    }
                    placeholder="jane@example.com"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">First Name</label>
                  <Input
                    value={singleContact.first_name || ""}
                    onChange={(e) =>
                      setSingleContact((c) => ({ ...c, first_name: e.target.value }))
                    }
                    placeholder="Jane"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Last Name</label>
                  <Input
                    value={singleContact.last_name || ""}
                    onChange={(e) =>
                      setSingleContact((c) => ({ ...c, last_name: e.target.value }))
                    }
                    placeholder="Doe"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">City</label>
                  <Input
                    value={singleContact.city || ""}
                    onChange={(e) =>
                      setSingleContact((c) => ({ ...c, city: e.target.value }))
                    }
                    placeholder="Spokane"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">State</label>
                  <Input
                    value={singleContact.state || ""}
                    onChange={(e) =>
                      setSingleContact((c) => ({ ...c, state: e.target.value }))
                    }
                    placeholder="WA"
                    maxLength={2}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">ZIP</label>
                  <Input
                    value={singleContact.zip || ""}
                    onChange={(e) =>
                      setSingleContact((c) => ({ ...c, zip: e.target.value }))
                    }
                    placeholder="99201"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Neighborhood/List Selection */}
          <div className="space-y-4 border-t pt-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Which area do these homeowners belong to?
              </label>
              {existingLists.length > 0 && (
                <div className="mb-2">
                  <select
                    value={existingListId || ""}
                    onChange={(e) => {
                      setExistingListId(e.target.value || null);
                      setListName(""); // Clear new list name if selecting existing
                    }}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select existing list...</option>
                    {existingLists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name} ({list.contact_count} contacts)
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="text-xs text-muted-foreground mb-2">Or create new:</div>
              <Input
                value={listName}
                onChange={(e) => {
                  setListName(e.target.value);
                  setExistingListId(null); // Clear existing selection if typing new name
                }}
                placeholder="e.g., South Hill Homeowners, Old Quotes"
              />
              <p className="text-xs text-muted-foreground mt-1">
                All imported contacts will be tagged with this list for easy targeting.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={submitting}>
            {submitting ? "Importing..." : "Import Contacts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}























































