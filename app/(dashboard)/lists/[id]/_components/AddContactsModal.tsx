"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, UserPlus } from "lucide-react";

type AddContactsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string;
  onSuccess: () => void;
};

export function AddContactsModal({
  open,
  onOpenChange,
  listId,
  onSuccess,
}: AddContactsModalProps) {
  const [activeTab, setActiveTab] = useState<"manual" | "csv">("manual");
  const [loading, setLoading] = useState(false);

  // Manual form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [tags, setTags] = useState("");

  // CSV state
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    try {
      const nameParts = name.trim().split(" ");
      const firstName = nameParts[0] || undefined;
      const lastName = nameParts.slice(1).join(" ") || undefined;
      const tagArray = tags.split(",").map((t) => t.trim()).filter(Boolean);

      // First, create or get the contact
      const contactRes = await fetch("/api/contacts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          firstName: firstName,
          lastName: lastName,
          city: city.trim() || undefined,
        }),
      });

      if (!contactRes.ok) {
        const error = await contactRes.json();
        throw new Error(error.error || "Failed to create contact");
      }

      // Wait a moment for the contact to be created, then fetch it
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Fetch the contact we just created
      const contactsRes = await fetch(
        `/api/contacts?q=${encodeURIComponent(email.trim())}`
      );
      if (!contactsRes.ok) {
        throw new Error("Failed to fetch contact");
      }
      const { contacts: contactsList } = await contactsRes.json();
      const contact = contactsList?.find(
        (c: any) => c.email.toLowerCase() === email.trim().toLowerCase()
      );

      if (!contact) {
        throw new Error("Contact created but not found. Please try again.");
      }

      // Update contact tags if provided
      if (tagArray.length > 0) {
        try {
          await fetch(`/api/contacts/${contact.id}/tags`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tags: tagArray }),
          });
        } catch (e) {
          // Tags update is optional, don't fail if it doesn't work
          console.warn("Failed to update tags:", e);
        }
      }

      // Add to list
      const listRes = await fetch(`/api/lists/${listId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_ids: [contact.id],
          tags: tagArray,
        }),
      });

      if (listRes.ok) {
        onSuccess();
        onOpenChange(false);
        // Reset form
        setName("");
        setEmail("");
        setCity("");
        setTags("");
      } else {
        const error = await listRes.json();
        alert(error.error || "Failed to add contact to list");
      }
    } catch (error: any) {
      console.error("Error adding contact:", error);
      alert(error.message || "Failed to add contact");
    } finally {
      setLoading(false);
    }
  };

  const handleCsvSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      formData.append("listId", listId);

      const res = await fetch("/api/contacts/import", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        onSuccess();
        onOpenChange(false);
        setCsvFile(null);
      } else {
        const error = await res.json();
        alert(error.error || "Failed to import contacts");
      }
    } catch (error) {
      console.error("Error importing CSV:", error);
      alert("Failed to import contacts");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add Contacts to List</DialogTitle>
          <DialogDescription>
            Add contacts manually or import from CSV
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">
              <UserPlus className="h-4 w-4 mr-2" />
              Manual
            </TabsTrigger>
            <TabsTrigger value="csv">
              <Upload className="h-4 w-4 mr-2" />
              CSV Import
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manual">
            <form onSubmit={handleManualSubmit} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  placeholder="Spokane"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  placeholder="HOT, Insurance, Old Quote"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading || !email.trim()}>
                  {loading ? "Adding..." : "Add to List"}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="csv">
            <form onSubmit={handleCsvSubmit} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="csv">CSV File</Label>
                <Input
                  id="csv"
                  type="file"
                  accept=".csv"
                  onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  CSV should include columns: email (required), first_name, last_name, city, tags
                </p>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading || !csvFile}>
                  {loading ? "Importing..." : "Import CSV"}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

