"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Plus,
  Search,
  Users,
  Split,
  Trash2,
  Download,
  MoreVertical,
  Tag,
  Filter,
} from "lucide-react";
import { AddContactsModal } from "./_components/AddContactsModal";
import { SplitListModal } from "./_components/SplitListModal";
import { CleanupListModal } from "./_components/CleanupListModal";
import { ListInsights } from "./_components/ListInsights";
import { formatDistanceToNow } from "date-fns";

type Contact = {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  city?: string;
  tags?: string[];
  created_at: string;
  added_to_list_at: string;
};

type List = {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  visibility: "everyone" | "owner_manager";
  created_at: string;
  updated_at: string;
  contact_count: number;
};

export default function ListDetailPage() {
  const params = useParams();
  const router = useRouter();
  const listId = params.id as string;

  const [list, setList] = useState<List | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [cleanupModalOpen, setCleanupModalOpen] = useState(false);

  const loadList = async () => {
    try {
      const res = await fetch(`/api/lists/${listId}`);
      const json = await res.json();
      setList(json.list);
    } catch (error) {
      console.error("Error loading list:", error);
    }
  };

  const loadContacts = async () => {
    try {
      const res = await fetch(`/api/lists/${listId}/contacts`);
      const json = await res.json();
      setContacts(json.contacts || []);
    } catch (error) {
      console.error("Error loading contacts:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (listId) {
      loadList();
      loadContacts();
    }
  }, [listId]);

  const filteredContacts = contacts.filter((contact) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      contact.email.toLowerCase().includes(query) ||
      contact.first_name?.toLowerCase().includes(query) ||
      contact.last_name?.toLowerCase().includes(query) ||
      contact.company?.toLowerCase().includes(query)
    );
  });

  if (loading && !list) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!list) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <h3 className="text-lg font-semibold mb-2">List not found</h3>
            <Button onClick={() => router.push("/lists")}>Back to Lists</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/lists")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{list.name}</h1>
          {list.description && (
            <p className="text-muted-foreground mt-1">{list.description}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-3 space-y-4">
          {/* Actions Bar */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setAddModalOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Contacts
              </Button>
              <Button
                variant="outline"
                onClick={() => setSplitModalOpen(true)}
              >
                <Split className="h-4 w-4 mr-2" />
                Split List
              </Button>
              <Button
                variant="outline"
                onClick={() => setCleanupModalOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clean Up
              </Button>
            </div>
          </div>

          {/* Contacts Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Contacts ({filteredContacts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredContacts.length === 0 ? (
                <div className="py-12 text-center">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No contacts found</h3>
                  <p className="text-muted-foreground mb-4">
                    {searchQuery
                      ? "No contacts match your search"
                      : "Add contacts to this list to get started"}
                  </p>
                  {!searchQuery && (
                    <Button onClick={() => setAddModalOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Contacts
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3 text-sm font-semibold">Name</th>
                        <th className="text-left p-3 text-sm font-semibold">Email</th>
                        <th className="text-left p-3 text-sm font-semibold">Company</th>
                        <th className="text-left p-3 text-sm font-semibold">City</th>
                        <th className="text-left p-3 text-sm font-semibold">Tags</th>
                        <th className="text-left p-3 text-sm font-semibold">Added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredContacts.map((contact) => (
                        <tr key={contact.id} className="border-b hover:bg-gray-50">
                          <td className="p-3">
                            {contact.first_name || contact.last_name
                              ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
                              : "-"}
                          </td>
                          <td className="p-3">{contact.email}</td>
                          <td className="p-3">{contact.company || "-"}</td>
                          <td className="p-3">{contact.city || "-"}</td>
                          <td className="p-3">
                            {contact.tags && contact.tags.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {contact.tags.slice(0, 3).map((tag) => (
                                  <span
                                    key={tag}
                                    className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded"
                                  >
                                    {tag}
                                  </span>
                                ))}
                                {contact.tags.length > 3 && (
                                  <span className="text-xs text-muted-foreground">
                                    +{contact.tags.length - 3}
                                  </span>
                                )}
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(contact.added_to_list_at), {
                              addSuffix: true,
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Insights Sidebar */}
        <div className="lg:col-span-1">
          <ListInsights listId={listId} />
        </div>
      </div>

      {/* Modals */}
      <AddContactsModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        listId={listId}
        onSuccess={() => {
          loadContacts();
          loadList();
        }}
      />

      <SplitListModal
        open={splitModalOpen}
        onOpenChange={setSplitModalOpen}
        listId={listId}
        listName={list.name}
        contactCount={list.contact_count}
        onSuccess={() => {
          router.push("/lists");
        }}
      />

      <CleanupListModal
        open={cleanupModalOpen}
        onOpenChange={setCleanupModalOpen}
        listId={listId}
        listName={list.name}
        onSuccess={() => {
          loadContacts();
          loadList();
        }}
      />
    </div>
  );
}





















































