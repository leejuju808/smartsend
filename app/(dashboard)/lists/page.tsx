"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/input";
import { Search, Plus, Users, Calendar, Tag, Eye, EyeOff, MoreVertical, Trash2, Edit, ExternalLink } from "lucide-react";
import { CreateListModal } from "./_components/CreateListModal";
import { formatDistanceToNow } from "date-fns";

type List = {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  visibility: "everyone" | "owner_manager";
  created_at: string;
  updated_at: string;
  contact_count: number;
  tags_in_list: string[];
};

export default function ListsPage() {
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingList, setEditingList] = useState<List | null>(null);
  const [deletingListId, setDeletingListId] = useState<string | null>(null);

  const loadLists = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) {
        params.set("search", searchQuery);
      }
      const res = await fetch(`/api/lists?${params.toString()}`);
      const json = await res.json();
      setLists(json.lists || []);
    } catch (error) {
      console.error("Error loading lists:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLists();
  }, [searchQuery]);

  const handleDelete = async (listId: string) => {
    if (!confirm("Are you sure you want to delete this list? This will not delete the contacts, only remove them from the list.")) {
      return;
    }

    setDeletingListId(listId);
    try {
      const res = await fetch(`/api/lists/${listId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await loadLists();
      } else {
        alert("Failed to delete list");
      }
    } catch (error) {
      console.error("Error deleting list:", error);
      alert("Failed to delete list");
    } finally {
      setDeletingListId(null);
    }
  };

  const filteredLists = lists.filter((list) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      list.name.toLowerCase().includes(query) ||
      list.description?.toLowerCase().includes(query) ||
      list.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Lists</h1>
          <p className="text-muted-foreground mt-1">
            Organize and segment your homeowner contacts
          </p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create New List
        </Button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search lists..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Lists Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2 mt-2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredLists.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No lists found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery
                ? "No lists match your search"
                : "Create your first list to organize your contacts"}
            </p>
            {!searchQuery && (
              <Button onClick={() => setCreateModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create New List
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLists.map((list) => (
            <ListCard
              key={list.id}
              list={list}
              onDelete={() => handleDelete(list.id)}
              isDeleting={deletingListId === list.id}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <CreateListModal
        open={createModalOpen || editingList !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreateModalOpen(false);
            setEditingList(null);
          }
        }}
        onSuccess={() => {
          setCreateModalOpen(false);
          setEditingList(null);
          loadLists();
        }}
        initialData={editingList || undefined}
      />
    </div>
  );
}

function ListCard({
  list,
  onDelete,
  isDeleting,
}: {
  list: List;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg mb-1">
              <Link
                href={`/lists/${list.id}`}
                className="hover:text-primary transition-colors"
              >
                {list.name}
              </Link>
            </CardTitle>
            {list.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {list.description}
              </p>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-8 bg-white border rounded-md shadow-lg z-10 min-w-[150px]">
                <Link
                  href={`/lists/${list.id}`}
                  className="flex items-center px-4 py-2 hover:bg-gray-50 text-sm"
                  onClick={() => setShowMenu(false)}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View List
                </Link>
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onDelete();
                  }}
                  disabled={isDeleting}
                  className="flex items-center w-full px-4 py-2 hover:bg-gray-50 text-sm text-red-600 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Contact Count */}
          <div className="flex items-center text-sm text-muted-foreground">
            <Users className="h-4 w-4 mr-2" />
            <span className="font-semibold text-foreground">
              {list.contact_count}
            </span>
            <span className="ml-1">contacts</span>
          </div>

          {/* Last Updated */}
          <div className="flex items-center text-sm text-muted-foreground">
            <Calendar className="h-4 w-4 mr-2" />
            Updated {formatDistanceToNow(new Date(list.updated_at), { addSuffix: true })}
          </div>

          {/* Tags */}
          {list.tags.length > 0 && (
            <div className="flex items-center flex-wrap gap-1">
              <Tag className="h-4 w-4 mr-1 text-muted-foreground" />
              {list.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Tags in List */}
          {list.tags_in_list && list.tags_in_list.length > 0 && (
            <div className="flex items-center flex-wrap gap-1 pt-1 border-t">
              <span className="text-xs text-muted-foreground">Tags in list:</span>
              {list.tags_in_list.slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded"
                >
                  {tag}
                </span>
              ))}
              {list.tags_in_list.length > 5 && (
                <span className="text-xs text-muted-foreground">
                  +{list.tags_in_list.length - 5} more
                </span>
              )}
            </div>
          )}

          {/* Visibility */}
          <div className="flex items-center text-sm text-muted-foreground">
            {list.visibility === "everyone" ? (
              <>
                <Eye className="h-4 w-4 mr-2" />
                Everyone
              </>
            ) : (
              <>
                <EyeOff className="h-4 w-4 mr-2" />
                Owner/Manager Only
              </>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-4 pt-4 border-t flex gap-2">
          <Link href={`/lists/${list.id}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full">
              View List
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}





















































