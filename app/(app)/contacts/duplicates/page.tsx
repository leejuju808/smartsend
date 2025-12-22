"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { MergeModal } from "@/components/contacts/MergeModal";
import Link from "next/link";

interface Contact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  city?: string;
  zip?: string;
  tags?: string[] | any;
  match_type?: string;
  match_score?: number;
}

interface DuplicateGroup {
  groupId: string;
  contacts: Contact[];
  matchType?: string;
  matchScore?: number;
}

export default function DuplicatesPage() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null);
  const [selectedPrimary, setSelectedPrimary] = useState<Contact | null>(null);
  const [selectedDuplicate, setSelectedDuplicate] = useState<Contact | null>(null);

  useEffect(() => {
    fetchDuplicates();
  }, []);

  async function fetchDuplicates() {
    setLoading(true);
    try {
      const res = await fetch("/api/contacts/duplicates");
      const data = await res.json();

      if (data.success && data.duplicates) {
        // Transform the new API format to match existing component expectations
        setGroups(data.duplicates.map((dup: any) => ({
          groupId: dup.groupId,
          contacts: dup.contacts,
          matchType: dup.matchType,
          matchScore: dup.matchScore,
        })));
      } else if (data.groups) {
        // Fallback to old format
        setGroups(data.groups);
      }
    } catch (error) {
      console.error("Failed to fetch duplicates:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleMergeClick = (group: DuplicateGroup, primary: Contact, duplicate: Contact) => {
    setSelectedGroup(group);
    setSelectedPrimary(primary);
    setSelectedDuplicate(duplicate);
    setMergeModalOpen(true);
  };

  const handleMergeComplete = () => {
    // Refresh the duplicates list
    fetchDuplicates();
  };

  const handleAutoMerge = async (group: DuplicateGroup) => {
    if (group.contacts.length < 2) return;

    // Use the earliest created contact as primary (first in array)
    const primary = group.contacts[0];
    const duplicates = group.contacts.slice(1);

    try {
      const res = await fetch("/api/contacts/merge-multi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryId: primary.id,
          duplicateIds: duplicates.map((c) => c.id),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Auto-merge failed");
        return;
      }

      alert(`Successfully merged ${data.mergedIds?.length || 0} contact(s)`);
      fetchDuplicates();
    } catch (error: any) {
      alert(error.message || "Auto-merge failed");
    }
  };

  const getMatchTypeLabel = (matchType?: string) => {
    switch (matchType) {
      case "exact_email":
        return "Exact Email Match";
      case "name_street":
        return "Same Name + Same Street";
      case "email_domain_name":
        return "Same Email Domain + Partial Name";
      case "phone":
        return "Same Phone Number";
      case "phone_exact":
        return "Exact Phone Match";
      case "name_zip":
        return "Same Name + ZIP";
      case "name_city":
        return "Same Name + City";
      default:
        return "Potential Duplicate";
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-8">Loading duplicates...</div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Duplicate Contacts</h1>
          <Link href="/contacts">
            <Button variant="outline">Back to Contacts</Button>
          </Link>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
          <p className="text-green-800 text-lg font-medium">
            No duplicate contacts found!
          </p>
          <p className="text-green-700 text-sm mt-2">
            Your contacts are clean and organized.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Duplicate Contacts</h1>
          <p className="text-gray-600 text-sm mt-1">
            {groups.length} duplicate group{groups.length !== 1 ? "s" : ""} found
          </p>
        </div>
        <Link href="/contacts">
          <Button variant="outline">Back to Contacts</Button>
        </Link>
      </div>

      <div className="space-y-6">
        {groups.map((group) => (
          <div
            key={group.groupId}
            className="border rounded-lg p-4 bg-white shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-medium text-lg">
                  Possible Duplicate Group {group.groupId.split("_").slice(-1)[0]}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {getMatchTypeLabel(group.matchType)} • {group.contacts.length} contact
                  {group.contacts.length !== 1 ? "s" : ""}
                </p>
              </div>
              {group.contacts.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAutoMerge(group)}
                >
                  Merge All
                </Button>
              )}
            </div>

            <div className="space-y-2">
              {group.contacts.map((contact, idx) => (
                <div
                  key={contact.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded border"
                >
                  <div className="flex-1">
                    <div className="font-medium">
                      {contact.name || <span className="text-gray-400">No name</span>}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      <span>Email: {contact.email}</span>
                      {contact.phone && <span className="ml-4">Phone: {contact.phone}</span>}
                      {contact.zip && <span className="ml-4">ZIP: {contact.zip}</span>}
                      {contact.city && <span className="ml-4">City: {contact.city}</span>}
                    </div>
                  </div>
                  {idx > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleMergeClick(group, group.contacts[0], contact)
                      }
                    >
                      Merge into Primary
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {mergeModalOpen && selectedPrimary && selectedDuplicate && (
        <MergeModal
          open={mergeModalOpen}
          onClose={() => {
            setMergeModalOpen(false);
            setSelectedPrimary(null);
            setSelectedDuplicate(null);
          }}
          primaryContact={selectedPrimary}
          duplicateContact={selectedDuplicate}
          onMergeComplete={handleMergeComplete}
        />
      )}
    </div>
  );
}









