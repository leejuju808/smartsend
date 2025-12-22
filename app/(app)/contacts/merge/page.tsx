"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { MergeModal } from "@/components/contacts/MergeModal";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Merge, CheckCircle2 } from "lucide-react";

interface Contact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  street?: string;
  city?: string;
  zip?: string;
  tags?: string[] | any;
  match_type?: string;
  match_score?: number;
  match_reason?: string;
}

interface DuplicateGroup {
  groupId: string;
  contacts: Contact[];
  matchType?: string;
  matchScore?: number;
  matchReason?: string;
}

/**
 * Manual Merge Tool Page
 * Path: /contacts/merge
 * Shows suspected duplicates with merge buttons
 */
export default function ContactMergePage() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null);
  const [selectedPrimary, setSelectedPrimary] = useState<Contact | null>(null);
  const [selectedDuplicate, setSelectedDuplicate] = useState<Contact | null>(null);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    fetchDuplicates();
  }, []);

  async function fetchDuplicates() {
    setLoading(true);
    try {
      const res = await fetch("/api/contacts/duplicates");
      const data = await res.json();

      if (data.success && data.duplicates) {
        setGroups(data.duplicates.map((dup: any) => ({
          groupId: dup.groupId,
          contacts: dup.contacts,
          matchType: dup.matchType,
          matchScore: dup.matchScore,
          matchReason: dup.matchReason,
        })));
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

  const handleMergeComplete = async () => {
    setMergeModalOpen(false);
    setSelectedPrimary(null);
    setSelectedDuplicate(null);
    // Refresh the duplicates list
    await fetchDuplicates();
  };

  const handleAutoMerge = async (group: DuplicateGroup) => {
    if (group.contacts.length < 2) return;

    setMerging(true);
    // Use the earliest created contact as primary (first in array)
    const primary = group.contacts[0];
    const duplicates = group.contacts.slice(1);

    try {
      // Merge each duplicate into primary
      for (const duplicate of duplicates) {
        const res = await fetch("/api/contacts/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            primaryId: primary.id,
            duplicateId: duplicate.id,
            reason: group.matchType || 'manual',
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          alert(`Failed to merge ${duplicate.email}: ${data.error || "Unknown error"}`);
          setMerging(false);
          return;
        }
      }

      // Refresh list
      await fetchDuplicates();
      alert(`Successfully merged ${duplicates.length} contact(s)`);
    } catch (error: any) {
      alert(error.message || "Auto-merge failed");
    } finally {
      setMerging(false);
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
      default:
        return "Potential Duplicate";
    }
  };

  const getMatchScoreColor = (score?: number) => {
    if (!score) return "bg-gray-100 text-gray-800";
    if (score >= 90) return "bg-red-100 text-red-800";
    if (score >= 70) return "bg-yellow-100 text-yellow-800";
    return "bg-blue-100 text-blue-800";
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-8">Loading potential duplicates...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Merge className="h-6 w-6" />
            Contact Merge Tool
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            Review and merge duplicate contacts to keep your lists clean
          </p>
        </div>
        <Link href="/contacts">
          <Button variant="outline">Back to Contacts</Button>
        </Link>
      </div>

      {groups.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
          <p className="text-green-800 text-lg font-medium">
            No duplicate contacts found!
          </p>
          <p className="text-green-700 text-sm mt-2">
            Your contacts are clean and organized. SmartSend will automatically merge duplicates as they're imported.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-800 text-sm">
              <strong>Potential Duplicates ({groups.length} sets):</strong> SmartSend found contacts that might be the same homeowner. 
              Review each set and merge to combine all their data (notes, replies, status, tags).
            </p>
          </div>

          <div className="space-y-6">
            {groups.map((group) => (
              <div
                key={group.groupId}
                className="border rounded-lg p-4 bg-white shadow-sm"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-medium text-lg">
                        Duplicate Group
                      </h3>
                      <Badge className={getMatchScoreColor(group.matchScore)}>
                        {group.matchScore || 0}% match
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600">
                      {getMatchTypeLabel(group.matchType)}
                      {group.matchReason && ` • ${group.matchReason}`}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {group.contacts.length} contact{group.contacts.length !== 1 ? "s" : ""} in this group
                    </p>
                  </div>
                  {group.contacts.length > 1 && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleAutoMerge(group)}
                      disabled={merging}
                    >
                      {merging ? "Merging..." : "Merge All"}
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  {group.contacts.map((contact, idx) => (
                    <div
                      key={contact.id}
                      className={`flex items-center justify-between p-3 rounded border ${
                        idx === 0 ? "bg-green-50 border-green-200" : "bg-gray-50"
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="font-medium">
                            {contact.name || <span className="text-gray-400">No name</span>}
                          </div>
                          {idx === 0 && (
                            <Badge variant="outline" className="bg-green-100 text-green-800">
                              Primary
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-gray-600 mt-1 space-y-1">
                          <div>Email: {contact.email}</div>
                          {contact.phone && <div>Phone: {contact.phone}</div>}
                          {(contact.street || contact.city || contact.zip) && (
                            <div>
                              {contact.street && <span>{contact.street}, </span>}
                              {contact.city && <span>{contact.city}, </span>}
                              {contact.zip && <span>{contact.zip}</span>}
                            </div>
                          )}
                          {contact.tags && Array.isArray(contact.tags) && contact.tags.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {contact.tags.map((tag: string, i: number) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {idx > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleMergeClick(group, group.contacts[0], contact)
                          }
                          disabled={merging}
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
        </>
      )}

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





















































