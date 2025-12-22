"use client";

import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { TagPill } from "@/components/tags/tag-pill";

interface TagLink {
  id: string;
  tag: {
    id: string;
    name: string;
  };
}

interface TagsResponse {
  tags: TagLink[];
}

export function TagManager({ leadId }: { leadId: string }) {
  const { data, mutate } = useSWR<TagsResponse>(`/api/leads/${leadId}/tags`);

  async function addTag(tagId: string) {
    await fetch(`/api/leads/${leadId}/tags/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag_id: tagId }),
    });
    mutate();
  }

  async function removeTag(linkId: string) {
    await fetch(`/api/leads/${leadId}/tags/${linkId}/delete`, {
      method: "POST",
    });
    mutate();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {data?.tags?.map((t) => (
          <div key={t.id} className="flex items-center gap-2">
            <TagPill name={t.tag.name} />
            <Button variant="ghost" size="xs" onClick={() => removeTag(t.id)}>
              ×
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}










