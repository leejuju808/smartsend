"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import useSWR from "swr";
import { useParams } from "next/navigation";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface TagsTabProps {
  lead: any;
  tags: Array<{ id: string; name: string }>;
}

export default function TagsTab({ lead, tags: initialTags }: TagsTabProps) {
  const params = useParams();
  const leadId = params.id as string;
  const { data, mutate } = useSWR(`/api/leads/${leadId}`, fetcher);
  
  const tags = data?.tags || initialTags || [];
  const [newTag, setNewTag] = useState("");

  const handleAddTag = async () => {
    if (!newTag.trim()) return;

    // First, check if tag exists, if not create it
    // Then link it to the lead
    // For now, we'll use the simple tags array on leads table
    const currentTags = lead.tags || [];
    if (currentTags.includes(newTag.trim())) {
      alert("Tag already exists");
      return;
    }

    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tags: [...currentTags, newTag.trim()],
      }),
    });

    if (res.ok) {
      setNewTag("");
      mutate();
    } else {
      const error = await res.json();
      alert(error.error || "Failed to add tag");
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    const currentTags = (lead.tags || []).filter((t: string) => t !== tagToRemove);

    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tags: currentTags,
      }),
    });

    if (res.ok) {
      mutate();
    } else {
      const error = await res.json();
      alert(error.error || "Failed to remove tag");
    }
  };

  const allTags = [
    ...tags.map((t: any) => (typeof t === "string" ? t : t.name)),
    ...(lead.tags || []),
  ].filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates

  return (
    <div className="mt-4 space-y-4">
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Tags</h2>
        
        {/* Add Tag */}
        <div className="mb-4">
          <div className="flex gap-2">
            <Input
              placeholder="Add a tag"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleAddTag();
                }
              }}
            />
            <Button onClick={handleAddTag}>Add</Button>
          </div>
        </div>

        {/* Tags List */}
        {allTags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {allTags.map((tag: string, idx: number) => (
              <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No tags yet. Add one above.</p>
        )}
      </Card>
    </div>
  );
}



