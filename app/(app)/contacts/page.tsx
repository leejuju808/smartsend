// Block 10800 — SmartSend Roofing Contact Loader v1
// Contacts page - View all imported homeowner contacts
// Block 12800 — Added bulk selection and actions

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ImportContactsModal } from "@/components/contacts/ImportContactsModal";
import { ExportLeadsModal } from "@/components/contacts/ExportLeadsModal";
import { BulkActionBar } from "@/components/contacts/BulkActionBar";
import { createClient } from "@/lib/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Contact = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  tags: string[];
  created_at: string;
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isManagerOrOwner, setIsManagerOrOwner] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    loadContacts();
    checkUserRole();
  }, []);

  async function checkUserRole() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Get workspace membership
      const { data: membership } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      setIsManagerOrOwner(
        membership?.role === "owner" || membership?.role === "manager"
      );
    } catch (err) {
      console.error("Error checking user role:", err);
    }
  }

  async function loadContacts() {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Get workspace_id from membership
      const { data: membership } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      const workspaceId = membership?.workspace_id;

      if (!workspaceId) {
        // Fallback to user_id if no workspace
        const { data, error } = await supabase
          .from("contacts")
          .select("id, email, first_name, last_name, city, state, zip, tags, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Error loading contacts:", error);
        } else {
          setContacts(data || []);
        }
        return;
      }

      const { data, error } = await supabase
        .from("contacts")
        .select("id, email, first_name, last_name, city, state, zip, tags, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading contacts:", error);
      } else {
        setContacts(data || []);
      }
    } catch (err) {
      console.error("Error loading contacts:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(contacts.map((c) => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectContact = (contactId: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(contactId);
    } else {
      newSelected.delete(contactId);
    }
    setSelectedIds(newSelected);
  };

  const isAllSelected = contacts.length > 0 && selectedIds.size === contacts.length;
  const isIndeterminate = selectedIds.size > 0 && selectedIds.size < contacts.length;

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Homeowner Contacts</h1>
          <p className="text-sm text-muted-foreground">
            Manage your imported homeowner leads and neighborhood lists.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setExportModalOpen(true)}>
            Export Leads
          </Button>
          <Button onClick={() => setImportModalOpen(true)}>Import Homeowners</Button>
        </div>
      </header>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading contacts...</div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <p className="text-muted-foreground mb-4">No contacts imported yet.</p>
          <Button onClick={() => setImportModalOpen(true)}>Import Your First Contacts</Button>
        </div>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={isAllSelected ? true : isIndeterminate ? "indeterminate" : false}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>ZIP</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(contact.id)}
                        onCheckedChange={(checked) =>
                          handleSelectContact(contact.id, checked)
                        }
                      />
                    </TableCell>
                    <TableCell className="font-medium">{contact.email}</TableCell>
                    <TableCell>
                      {contact.first_name || contact.last_name
                        ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
                        : "—"}
                    </TableCell>
                    <TableCell>{contact.city || "—"}</TableCell>
                    <TableCell>{contact.state || "—"}</TableCell>
                    <TableCell>{contact.zip || "—"}</TableCell>
                    <TableCell>
                      {contact.tags && contact.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {contact.tags.map((tag, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(contact.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <BulkActionBar
            selectedIds={Array.from(selectedIds)}
            onClearSelection={() => setSelectedIds(new Set())}
            onActionComplete={() => {
              setSelectedIds(new Set());
              loadContacts();
            }}
            isManagerOrOwner={isManagerOrOwner}
          />
        </>
      )}

      <ImportContactsModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        onSuccess={() => {
          loadContacts();
        }}
      />

      <ExportLeadsModal
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
      />
    </div>
  );
}



