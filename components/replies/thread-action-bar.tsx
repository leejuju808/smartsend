"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Archive,
  CheckCircle2,
  Star,
  Tag,
  UserPlus,
  RotateCcw,
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

type ThreadActionBarProps = {
  thread: {
    id: string;
    archived?: boolean;
    done?: boolean;
    important?: boolean;
    assigned_to?: string | null;
    tags?: string[];
  };
  teamMembers?: Array<{ id: string; name: string; email: string }>;
  onUpdate?: () => void;
};

export function ThreadActionBar({
  thread,
  teamMembers = [],
  onUpdate,
}: ThreadActionBarProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);

  const handleAction = async (
    action: string,
    endpoint: string,
    body?: any
  ) => {
    if (loading) return;
    setLoading(action);

    try {
      const res = await fetch(`/api/replies/thread/${thread.id}/actions/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Action failed");
      }

      toast.success("Thread updated");
      router.refresh();
      onUpdate?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Action failed";
      toast.error(message);
    } finally {
      setLoading(null);
    }
  };

  const handleTag = async () => {
    if (!tagInput.trim()) return;
    await handleAction("tag", "tag", { tag: tagInput.trim() });
    setTagInput("");
    setTagOpen(false);
  };

  const handleAssign = async (userId: string | null) => {
    await handleAction("assign", "assign", { user_id: userId });
    setAssignOpen(false);
  };

  return (
    <div className="flex gap-2 flex-wrap">
      {/* Assign Button */}
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
              onClick={() => handleAssign(null)}
              className="w-full text-left px-3 py-2 rounded hover:bg-muted text-sm"
            >
              Unassign
            </button>
            {teamMembers.map((member) => (
              <button
                key={member.id}
                onClick={() => handleAssign(member.id)}
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

      {/* Tag Button */}
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
                    handleTag();
                  }
                }}
              />
              <Button size="sm" onClick={handleTag} disabled={!tagInput.trim()}>
                Add
              </Button>
            </div>
            {thread.tags && thread.tags.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="text-xs text-muted-foreground">Current tags:</div>
                <div className="flex flex-wrap gap-1">
                  {thread.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-1 bg-muted rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Done Button */}
      <Button
        size="sm"
        variant={thread.done ? "default" : "outline"}
        disabled={!!loading}
        onClick={() => handleAction("done", "done")}
        className="h-8"
      >
        {loading === "done" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4 mr-1" />
        )}
        Done
      </Button>

      {/* Archive Button */}
      {!thread.archived ? (
        <Button
          size="sm"
          variant="outline"
          disabled={!!loading}
          onClick={() => handleAction("archive", "archive")}
          className="h-8"
        >
          {loading === "archive" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Archive className="h-4 w-4 mr-1" />
          )}
          Archive
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={!!loading}
          onClick={() => handleAction("reopen", "reopen")}
          className="h-8"
        >
          {loading === "reopen" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4 mr-1" />
          )}
          Reopen
        </Button>
      )}

      {/* Important Button */}
      <Button
        size="sm"
        variant={thread.important ? "default" : "outline"}
        disabled={!!loading}
        onClick={() =>
          handleAction("important", "important", {
            important: !thread.important,
          })
        }
        className="h-8"
      >
        {loading === "important" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Star
            className={`h-4 w-4 mr-1 ${thread.important ? "fill-yellow-400" : ""}`}
          />
        )}
        Important
      </Button>
    </div>
  );
}

