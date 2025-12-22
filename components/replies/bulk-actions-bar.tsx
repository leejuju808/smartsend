"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Archive,
  Tag,
  UserPlus,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

type BulkActionsBarProps = {
  selectedThreadIds: string[];
  teamMembers?: Array<{ id: string; name: string; email: string }>;
  onClearSelection?: () => void;
};

export function BulkActionsBar({
  selectedThreadIds,
  teamMembers = [],
  onClearSelection,
}: BulkActionsBarProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);

  const handleBulkAction = async (
    action: string,
    endpoint: string,
    body?: any
  ) => {
    if (loading || selectedThreadIds.length === 0) return;
    setLoading(action);

    try {
      const promises = selectedThreadIds.map((threadId) =>
        fetch(`/api/replies/thread/${threadId}/actions/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body || {}),
        })
      );

      const results = await Promise.all(promises);
      const failed = results.filter((r) => !r.ok);

      if (failed.length > 0) {
        throw new Error(`${failed.length} threads failed to update`);
      }

      toast.success(`Updated ${selectedThreadIds.length} thread${selectedThreadIds.length > 1 ? "s" : ""}`);
      router.refresh();
      onClearSelection?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bulk action failed";
      toast.error(message);
    } finally {
      setLoading(null);
    }
  };

  const handleBulkTag = async () => {
    if (!tagInput.trim()) return;
    await handleBulkAction("tag", "tag", { tag: tagInput.trim() });
    setTagInput("");
    setTagOpen(false);
  };

  const handleBulkAssign = async (userId: string | null) => {
    await handleBulkAction("assign", "assign", { user_id: userId });
    setAssignOpen(false);
  };

  if (selectedThreadIds.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 border rounded-lg p-2 bg-muted/50">
      <div className="text-sm font-medium">
        {selectedThreadIds.length} selected
      </div>

      {/* Bulk Assign */}
      <Popover open={assignOpen} onOpenChange={setAssignOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            disabled={!!loading}
            className="h-8"
          >
            {loading === "assign" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4 mr-1" />
            )}
            Assign
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64">
          <div className="space-y-1">
            <div className="text-sm font-medium mb-2">Assign to</div>
            <button
              onClick={() => handleBulkAssign(null)}
              className="w-full text-left px-3 py-2 rounded hover:bg-muted text-sm"
            >
              Unassign
            </button>
            {teamMembers.map((member) => (
              <button
                key={member.id}
                onClick={() => handleBulkAssign(member.id)}
                className="w-full text-left px-3 py-2 rounded hover:bg-muted text-sm"
              >
                {member.name || member.email}
              </button>
            ))}
            {teamMembers.length === 0 && (
              <div className="text-xs text-muted-foreground px-3 py-2">
                No team members available
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Bulk Tag */}
      <Popover open={tagOpen} onOpenChange={setTagOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            disabled={!!loading}
            className="h-8"
          >
            {loading === "tag" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Tag className="h-4 w-4 mr-1" />
            )}
            Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64">
          <div className="space-y-2">
            <div className="text-sm font-medium">Add tag</div>
            <div className="flex gap-2">
              <Input
                placeholder="e.g., warm-lead"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleBulkTag();
                  }
                }}
              />
              <Button size="sm" onClick={handleBulkTag} disabled={!tagInput.trim()}>
                Add
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Bulk Archive */}
      <Button
        size="sm"
        variant="outline"
        disabled={!!loading}
        onClick={() => handleBulkAction("archive", "archive")}
        className="h-8"
      >
        {loading === "archive" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Archive className="h-4 w-4 mr-1" />
        )}
        Archive
      </Button>
    </div>
  );
}










