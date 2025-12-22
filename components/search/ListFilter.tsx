"use client";

import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { createClientComponentClient } from "@/lib/supabase";

interface List {
  id: string;
  name: string;
}

interface ListFilterProps {
  value?: string;
  onChange: (value?: string) => void;
}

export function ListFilter({ value, onChange }: ListFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(false);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const fetchLists = async () => {
      setLoading(true);
      try {
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

        // Check if lists/segments table exists and fetch
        const { data } = await supabase
          .from("lists")
          .select("id, name")
          .eq("workspace_id", membership.workspace_id)
          .order("created_at", { ascending: false })
          .limit(100);

        // If lists table doesn't exist, try segments
        if (!data) {
          const { data: segments } = await supabase
            .from("segments")
            .select("id, name")
            .eq("workspace_id", membership.workspace_id)
            .order("created_at", { ascending: false })
            .limit(100);
          setLists(segments || []);
        } else {
          setLists(data || []);
        }
      } catch (error) {
        console.error("Error fetching lists:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLists();
  }, [supabase]);

  const selectedList = lists.find((l) => l.id === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50"
      >
        <span className={value ? "text-gray-900" : "text-gray-500"}>
          {value ? selectedList?.name || "List" : "List"}
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
            ) : lists.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No lists</div>
            ) : (
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    onChange(undefined);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
                    !value ? "bg-gray-100 font-medium" : "text-gray-900"
                  }`}
                >
                  All Lists
                </button>
                {lists.map((list) => (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => {
                      onChange(list.id);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
                      value === list.id
                        ? "bg-gray-100 font-medium"
                        : "text-gray-900"
                    }`}
                  >
                    {list.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}





















































