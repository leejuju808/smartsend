"use client";

import { useState, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";
import { createClientComponentClient } from "@/lib/supabase";

interface TagFilterProps {
  value: string[];
  onChange: (tags: string[]) => void;
}

export function TagFilter({ value, onChange }: TagFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const fetchTags = async () => {
      setLoading(true);
      try {
        // Get current workspace
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: membership } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (!membership?.workspace_id) return;

        // Fetch all unique tags from contacts
        const { data: contacts } = await supabase
          .from("contacts")
          .select("tags")
          .eq("workspace_id", membership.workspace_id)
          .not("tags", "is", null);

        const allTags = new Set<string>();
        contacts?.forEach((contact) => {
          if (contact.tags && Array.isArray(contact.tags)) {
            contact.tags.forEach((tag) => allTags.add(tag));
          }
        });

        setAvailableTags(Array.from(allTags).sort());
      } catch (error) {
        console.error("Error fetching tags:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTags();
  }, [supabase]);

  const toggleTag = (tag: string) => {
    if (value.includes(tag)) {
      onChange(value.filter((t) => t !== tag));
    } else {
      onChange([...value, tag]);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50"
      >
        <span className={value.length > 0 ? "text-gray-900" : "text-gray-500"}>
          {value.length > 0 ? `${value.length} tag${value.length > 1 ? "s" : ""}` : "Tags"}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
            {loading ? (
              <div className="px-3 py-2 text-sm text-gray-500">Loading...</div>
            ) : availableTags.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No tags available</div>
            ) : (
              <div className="py-1">
                {availableTags.map((tag) => (
                  <label
                    key={tag}
                    className="flex items-center px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={value.includes(tag)}
                      onChange={() => toggleTag(tag)}
                      className="mr-2 rounded border-gray-300 text-black focus:ring-black"
                    />
                    <span className="text-gray-900">{tag}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}





















































