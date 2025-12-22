// Block 11000 — Step 3: Import Starter List
// Screen: "Let's load some homeowners to contact"

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Step3ContactsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [importMethod, setImportMethod] = useState<"csv" | "manual" | "single">("csv");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [manualEmails, setManualEmails] = useState("");
  const [singleContact, setSingleContact] = useState({ email: "", firstName: "", lastName: "" });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "text/csv") {
      setCsvFile(file);
    } else {
      alert("Please select a CSV file");
    }
  };

  const parseManualEmails = (text: string) => {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && line.includes("@"))
      .map((email) => ({ email: email.trim() }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let contacts: Array<{ email: string; firstName?: string; lastName?: string }> = [];

      if (importMethod === "csv" && csvFile) {
        // Parse CSV file
        const text = await csvFile.text();
        const lines = text.split("\n").filter((line) => line.trim());
        const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

        const emailIndex = headers.findIndex((h) =>
          ["email", "e-mail", "email address"].includes(h)
        );
        const firstNameIndex = headers.findIndex((h) =>
          ["first name", "firstname", "fname", "first"].includes(h)
        );
        const lastNameIndex = headers.findIndex((h) =>
          ["last name", "lastname", "lname", "last"].includes(h)
        );

        if (emailIndex === -1) {
          alert("CSV must have an 'email' column");
          setLoading(false);
          return;
        }

        contacts = lines.slice(1).map((line) => {
          const values = line.split(",").map((v) => v.trim());
          return {
            email: values[emailIndex] || "",
            firstName: firstNameIndex >= 0 ? values[firstNameIndex] : undefined,
            lastName: lastNameIndex >= 0 ? values[lastNameIndex] : undefined,
          };
        });
      } else if (importMethod === "manual") {
        contacts = parseManualEmails(manualEmails);
        if (contacts.length === 0) {
          alert("Please enter at least one email address");
          setLoading(false);
          return;
        }
        if (contacts.length > 20) {
          alert("Manual import limited to 20 emails. Please use CSV for larger lists.");
          setLoading(false);
          return;
        }
      } else if (importMethod === "single") {
        if (!singleContact.email) {
          alert("Please enter an email address");
          setLoading(false);
          return;
        }
        contacts = [singleContact];
      }

      if (contacts.length === 0) {
        alert("No contacts to import");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/onboarding/step-3-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacts,
          listName: "Old Quotes",
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "Failed to import contacts");
        setLoading(false);
        return;
      }

      const data = await res.json();
      alert(`Successfully imported ${data.contactsImported} contacts!`);
      router.push("/onboarding/step-4-launch");
    } catch (error: any) {
      console.error("Error:", error);
      alert("An error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <div className="text-xs text-gray-500 mb-2">Step 3 of 4</div>
        <h1 className="text-2xl font-semibold mb-2">
          Let&apos;s load some homeowners to contact
        </h1>
        <p className="text-sm text-gray-600">
          Upload your Old Quotes list (people you already gave an estimate to).
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-3">Import Method</label>
          <div className="space-y-2">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="method"
                value="csv"
                checked={importMethod === "csv"}
                onChange={() => setImportMethod("csv")}
                className="w-4 h-4 text-black border-gray-300 focus:ring-black"
              />
              <span className="text-sm">Upload CSV of old quotes / past leads</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="method"
                value="manual"
                checked={importMethod === "manual"}
                onChange={() => setImportMethod("manual")}
                className="w-4 h-4 text-black border-gray-300 focus:ring-black"
              />
              <span className="text-sm">Paste emails manually (up to 20)</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="method"
                value="single"
                checked={importMethod === "single"}
                onChange={() => setImportMethod("single")}
                className="w-4 h-4 text-black border-gray-300 focus:ring-black"
              />
              <span className="text-sm">Add single contact</span>
            </label>
          </div>
        </div>

        {importMethod === "csv" && (
          <div>
            <label className="block text-sm font-medium mb-2">
              CSV File <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              CSV should have columns: email, first_name (optional), last_name (optional)
            </p>
          </div>
        )}

        {importMethod === "manual" && (
          <div>
            <label className="block text-sm font-medium mb-2">
              Email Addresses (one per line) <span className="text-red-500">*</span>
            </label>
            <textarea
              value={manualEmails}
              onChange={(e) => setManualEmails(e.target.value)}
              rows={10}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black focus:border-transparent font-mono text-sm"
              placeholder="john@example.com&#10;jane@example.com&#10;..."
            />
            <p className="text-xs text-gray-500 mt-1">
              Enter up to 20 email addresses, one per line
            </p>
          </div>
        )}

        {importMethod === "single" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                required
                value={singleContact.email}
                onChange={(e) =>
                  setSingleContact({ ...singleContact, email: e.target.value })
                }
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                placeholder="john@example.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">First Name</label>
                <input
                  type="text"
                  value={singleContact.firstName}
                  onChange={(e) =>
                    setSingleContact({ ...singleContact, firstName: e.target.value })
                  }
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Last Name</label>
                <input
                  type="text"
                  value={singleContact.lastName}
                  onChange={(e) =>
                    setSingleContact({ ...singleContact, lastName: e.target.value })
                  }
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}

        <div className="border rounded-lg p-4 bg-blue-50">
          <p className="text-sm text-blue-900">
            💡 <strong>Tip:</strong> Upload your Old Quotes list (people you already gave an estimate to). These have the highest reply rate!
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => router.push("/onboarding/step-2-email")}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 text-sm bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Importing..." : "Import Contacts"}
          </button>
        </div>
      </form>
    </div>
  );
}























































