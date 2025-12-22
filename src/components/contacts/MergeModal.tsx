"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Contact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  zip?: string;
  company?: string;
  title?: string;
  tags?: string[] | any;
}

interface MergeModalProps {
  open: boolean;
  onClose: () => void;
  primaryContact: Contact;
  duplicateContact: Contact;
  onMergeComplete: () => void;
}

export function MergeModal({
  open,
  onClose,
  primaryContact,
  duplicateContact,
  onMergeComplete,
}: MergeModalProps) {
  const [resolvedFields, setResolvedFields] = useState<Record<string, string>>({});
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    // Initialize resolved fields with primary contact values
    setResolvedFields({
      email: primaryContact.email || "",
      first_name: primaryContact.name?.split(" ")[0] || "",
      last_name: primaryContact.name?.split(" ").slice(1).join(" ") || "",
      phone: primaryContact.phone || "",
      address: primaryContact.address || "",
      city: primaryContact.city || "",
      zip: primaryContact.zip || "",
      company: primaryContact.company || "",
      title: primaryContact.title || "",
    });
  }, [primaryContact, duplicateContact]);

  const handleFieldChange = (field: string, value: string) => {
    setResolvedFields((prev) => ({ ...prev, [field]: value }));
  };

  const handleMerge = async () => {
    setMerging(true);
    try {
      const res = await fetch("/api/contacts/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryId: primaryContact.id,
          duplicateId: duplicateContact.id,
          resolvedFields,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Merge failed");
        return;
      }

      onMergeComplete();
      onClose();
    } catch (error: any) {
      alert(error.message || "Merge failed");
    } finally {
      setMerging(false);
    }
  };

  const getFieldValue = (field: string, contact: Contact): string => {
    switch (field) {
      case "email":
        return contact.email || "";
      case "first_name":
        return contact.name?.split(" ")[0] || "";
      case "last_name":
        return contact.name?.split(" ").slice(1).join(" ") || "";
      case "phone":
        return contact.phone || "";
      case "address":
        return contact.address || "";
      case "city":
        return contact.city || "";
      case "zip":
        return contact.zip || "";
      case "company":
        return contact.company || "";
      case "title":
        return contact.title || "";
      default:
        return "";
    }
  };

  const fields = [
    { key: "email", label: "Email" },
    { key: "first_name", label: "First Name" },
    { key: "last_name", label: "Last Name" },
    { key: "phone", label: "Phone" },
    { key: "address", label: "Address" },
    { key: "city", label: "City" },
    { key: "zip", label: "ZIP" },
    { key: "company", label: "Company" },
    { key: "title", label: "Title" },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Merge Contacts</DialogTitle>
          <DialogDescription>
            Select which values to keep for each field. The duplicate contact will be merged into
            the primary contact.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-4 gap-4 text-sm font-medium border-b pb-2">
            <div>Field</div>
            <div>Primary Contact</div>
            <div>Duplicate Contact</div>
            <div>Result</div>
          </div>

          {fields.map((field) => {
            const primaryValue = getFieldValue(field.key, primaryContact);
            const duplicateValue = getFieldValue(field.key, duplicateContact);
            const hasConflict = primaryValue !== duplicateValue && primaryValue && duplicateValue;

            return (
              <div key={field.key} className="grid grid-cols-4 gap-4 items-center">
                <Label className="font-medium">{field.label}</Label>
                <div className="text-sm text-gray-600">
                  {primaryValue || <span className="text-gray-400">—</span>}
                </div>
                <div className="text-sm text-gray-600">
                  {duplicateValue || <span className="text-gray-400">—</span>}
                </div>
                <div>
                  {hasConflict ? (
                    <select
                      className="w-full border rounded px-2 py-1 text-sm"
                      value={
                        resolvedFields[field.key] === duplicateValue
                          ? "duplicate"
                          : "primary"
                      }
                      onChange={(e) => {
                        const value =
                          e.target.value === "duplicate" ? duplicateValue : primaryValue;
                        handleFieldChange(field.key, value);
                      }}
                    >
                      <option value="primary">Keep Primary</option>
                      <option value="duplicate">Keep Duplicate</option>
                    </select>
                  ) : (
                    <Input
                      type="text"
                      value={resolvedFields[field.key] || primaryValue || duplicateValue || ""}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      className="text-sm"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={merging}>
            Cancel
          </Button>
          <Button onClick={handleMerge} disabled={merging}>
            {merging ? "Merging..." : "Merge Contacts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}





























































