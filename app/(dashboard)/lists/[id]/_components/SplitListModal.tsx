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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Split } from "lucide-react";

type SplitListModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string;
  listName: string;
  contactCount: number;
  onSuccess: () => void;
};

export function SplitListModal({
  open,
  onOpenChange,
  listId,
  listName,
  contactCount,
  onSuccess,
}: SplitListModalProps) {
  const [splitType, setSplitType] = useState<"size" | "tag" | "status">("size");
  const [chunkSize, setChunkSize] = useState("");
  const [tag, setTag] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (splitType === "size" && (!chunkSize || parseInt(chunkSize) < 1)) {
      alert("Chunk size must be at least 1");
      return;
    }

    if (splitType === "tag" && !tag.trim()) {
      alert("Tag is required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/lists/${listId}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: splitType,
          chunk_size: splitType === "size" ? parseInt(chunkSize) : undefined,
          tag: splitType === "tag" ? tag.trim() : undefined,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        alert(
          `List split successfully! Created ${json.new_lists?.length || 0} new lists.`
        );
        onSuccess();
        onOpenChange(false);
        // Reset form
        setSplitType("size");
        setChunkSize("");
        setTag("");
      } else {
        const error = await res.json();
        alert(error.error || "Failed to split list");
      }
    } catch (error) {
      console.error("Error splitting list:", error);
      alert("Failed to split list");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Split className="h-5 w-5" />
              Split List
            </DialogTitle>
            <DialogDescription>
              Split "{listName}" into smaller lists for better organization
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Split Type */}
            <div className="space-y-2">
              <Label htmlFor="splitType">Split By</Label>
              <Select
                value={splitType}
                onValueChange={(value: "size" | "tag" | "status") =>
                  setSplitType(value)
                }
              >
                <SelectTrigger id="splitType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="size">By Size (Equal Chunks)</SelectItem>
                  <SelectItem value="tag">By Tag</SelectItem>
                  <SelectItem value="status">By Status (HOT/WARM/NEW/etc)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Chunk Size (for size split) */}
            {splitType === "size" && (
              <div className="space-y-2">
                <Label htmlFor="chunkSize">Chunk Size</Label>
                <Input
                  id="chunkSize"
                  type="number"
                  min="1"
                  max={contactCount}
                  placeholder={`e.g., 300 (Total: ${contactCount} contacts)`}
                  value={chunkSize}
                  onChange={(e) => setChunkSize(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  This will create lists of approximately {chunkSize || "?"} contacts each
                </p>
              </div>
            )}

            {/* Tag (for tag split) */}
            {splitType === "tag" && (
              <div className="space-y-2">
                <Label htmlFor="tag">Tag to Split By</Label>
                <Input
                  id="tag"
                  placeholder="e.g., South Hill, North Side, Downtown"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Creates separate lists for each unique value of this tag
                </p>
              </div>
            )}

            {/* Status Split Info */}
            {splitType === "status" && (
              <div className="p-4 bg-blue-50 rounded-md">
                <p className="text-sm text-blue-900">
                  This will automatically split the list by status tags:
                </p>
                <ul className="mt-2 text-sm text-blue-800 list-disc list-inside">
                  <li>HOT</li>
                  <li>WARM</li>
                  <li>NOT INTERESTED</li>
                  <li>NEW</li>
                </ul>
              </div>
            )}
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
            <Button type="submit" disabled={loading}>
              {loading ? "Splitting..." : "Split List"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}





















































