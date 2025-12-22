// Block 9400 — Bulk Actions Engine
"use client";
import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkActionBar } from "@/components/contacts/BulkActionBar";
import { ExportContactsModal } from "@/components/contacts/ExportContactsModal";
import { DuplicateBanner } from "@/components/contacts/DuplicateBanner";
import { Button } from "@/components/ui/Button";

export default function ContactsPage() {
  const [q, setQ] = useState("");
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  async function fetchContacts() {
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      const data = await res.json();
      if (data.ok) {
        setContacts(data.contacts || []);
      }
    } catch (error) {
      console.error("Failed to fetch contacts:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchContacts();
  }, [q]);

  async function upload() {
    if (!file) return alert("Choose CSV");
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch("/api/contacts/bulk", { method: "POST", body: fd });
    const j = await res.json();
    if (!res.ok || !j.ok) return alert(j.error || "Upload failed");
    setFile(null);
    fetchContacts(); // Refresh the list
  }

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
    if (!bulkMode && newSelected.size > 0) {
      setBulkMode(true);
    }
    if (newSelected.size === 0) {
      setBulkMode(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
      setBulkMode(false);
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.id)));
      setBulkMode(true);
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBulkMode(false);
  };

  const performBulkAction = async (action: any) => {
    if (selectedIds.size === 0) return;
    setProcessing(true);
    try {
      const res = await fetch("/api/contacts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactIds: Array.from(selectedIds),
          action,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error || "Bulk action failed");
        return;
      }
      // Optimistic update
      await fetchContacts();
      clearSelection();
    } catch (error) {
      console.error("Bulk action error:", error);
      alert("Failed to perform bulk action");
    } finally {
      setProcessing(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    await performBulkAction({ type: "status", value: status });
  };

  const handleAddTags = async (tags: string[]) => {
    await performBulkAction({ type: "add_tags", tags });
  };

  const handleRemoveTags = async (tags: string[]) => {
    await performBulkAction({ type: "remove_tags", tags });
  };

  const handleAssignOwner = async (ownerId: string) => {
    await performBulkAction({ type: "assign_owner", ownerId });
  };

  const handleSuppress = async () => {
    await performBulkAction({ type: "suppress" });
  };

  const handleDelete = async () => {
    await performBulkAction({ type: "delete" });
  };

  return (
    <div className="p-6 space-y-6 pb-24">
      <h1 className="text-2xl font-semibold">Contacts</h1>

      <DuplicateBanner />

      <div className="flex gap-2 items-center">
        <input
          className="border rounded px-2 py-1"
          placeholder="Search name/email/company"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setExportModalOpen(true)}
          >
            Export
          </Button>
          <a
            href="/import/contacts"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
          >
            Import Contacts
          </a>
          {!bulkMode && (
            <button
              className="border rounded px-3 py-1"
              onClick={() => setBulkMode(true)}
            >
              Select
            </button>
          )}
        </div>
      </div>

      {loading && <div className="text-center py-4">Loading...</div>}

      <div className="border rounded-xl p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              {bulkMode && (
                <th className="py-2 pr-3 w-10">
                  <Checkbox
                    checked={selectedIds.size === contacts.length && contacts.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
              )}
              <th className="py-2 pr-3">Email</th>
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Company</th>
              <th className="py-2 pr-3">Tags</th>
              <th className="py-2 pr-3">Attrs</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c: any) => (
              <tr key={c.id} className="border-t">
                {bulkMode && (
                  <td className="py-2 pr-3">
                    <Checkbox
                      checked={selectedIds.has(c.id)}
                      onCheckedChange={() => toggleSelect(c.id)}
                    />
                  </td>
                )}
                <td className="py-2 pr-3">{c.email}</td>
                <td className="py-2 pr-3">
                  {[c.first_name, c.last_name].filter(Boolean).join(" ")}
                </td>
                <td className="py-2 pr-3">{c.company || "—"}</td>
                <td className="py-2 pr-3">{(c.tags || []).join(", ") || "—"}</td>
                <td className="py-2 pr-3 truncate max-w-[360px]">
                  {JSON.stringify(c.attrs || {})}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <BulkActionBar
        selectedCount={selectedIds.size}
        onStatusChange={handleStatusChange}
        onAddTags={handleAddTags}
        onRemoveTags={handleRemoveTags}
        onAssignOwner={handleAssignOwner}
        onSuppress={handleSuppress}
        onDelete={handleDelete}
        onClearSelection={clearSelection}
      />

      <ExportContactsModal
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
      />
    </div>
  );
}