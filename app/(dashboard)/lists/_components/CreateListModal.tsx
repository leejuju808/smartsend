"use client";

import { useState, useEffect } from "react";
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

type List = {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  visibility: "everyone" | "owner_manager";
};

type CreateListModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  initialData?: List;
};

export function CreateListModal({
  open,
  onOpenChange,
  onSuccess,
  initialData,
}: CreateListModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tag, setTag] = useState("");
  const [visibility, setVisibility] = useState<"everyone" | "owner_manager">("everyone");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setDescription(initialData.description || "");
      setTag(initialData.tags[0] || "");
      setVisibility(initialData.visibility);
    } else {
      setName("");
      setDescription("");
      setTag("");
      setVisibility("everyone");
    }
  }, [initialData, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      const url = initialData ? `/api/lists/${initialData.id}` : "/api/lists";
      const method = initialData ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          tag: tag.trim() || undefined,
          visibility,
        }),
      });

      if (res.ok) {
        onSuccess();
        onOpenChange(false);
      } else {
        const error = await res.json();
        alert(error.error || "Failed to save list");
      }
    } catch (error) {
      console.error("Error saving list:", error);
      alert("Failed to save list");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {initialData ? "Edit List" : "Create New List"}
            </DialogTitle>
            <DialogDescription>
              {initialData
                ? "Update your list details"
                : "Create a new list to organize your contacts"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* List Name */}
            <div className="space-y-2">
              <Label htmlFor="name">List Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Old Quotes, Past Jobs, Storm Damage"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Input
                id="description"
                placeholder="Brief description of this list"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Tag */}
            <div className="space-y-2">
              <Label htmlFor="tag">Auto-apply Tag (Optional)</Label>
              <Input
                id="tag"
                placeholder="e.g., Old Quotes, Insurance Claims"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This tag will be automatically applied to all contacts added to this list
              </p>
            </div>

            {/* Visibility */}
            <div className="space-y-2">
              <Label htmlFor="visibility">Visibility</Label>
              <Select
                value={visibility}
                onValueChange={(value: "everyone" | "owner_manager") =>
                  setVisibility(value)
                }
              >
                <SelectTrigger id="visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="everyone">
                    Everyone (Owner + Manager + Staff)
                  </SelectItem>
                  <SelectItem value="owner_manager">
                    Only Owner / Manager
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
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
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading
                ? "Saving..."
                : initialData
                ? "Update List"
                : "Create List"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}





















































