"use client";

// Block 10900 — Roofing Templates Library
// Snippets Picker Component for Email Editor Integration

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Search, MessageSquare } from "lucide-react";

type Snippet = {
  id: string;
  body: string;
};

type SnippetsByCategory = Record<string, Snippet[]>;

interface SnippetsPickerProps {
  onInsert: (text: string) => void;
  trigger?: React.ReactNode;
}

const CATEGORY_LABELS: Record<string, string> = {
  local_proof: "Local Proof",
  insurance_support: "Insurance Support",
  soft_cta: "Soft CTA",
  social_proof: "Social Proof",
  urgency_storm: "Urgency / Storm",
};

export function SnippetsPicker({ onInsert, trigger }: SnippetsPickerProps) {
  const [snippets, setSnippets] = useState<SnippetsByCategory>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (open) {
      loadSnippets();
    }
  }, [open]);

  const loadSnippets = async () => {
    try {
      const res = await fetch("/api/templates/snippets");
      const data = await res.json();
      if (res.ok) {
        setSnippets(data.snippets || {});
      }
    } catch (error) {
      console.error("Failed to load snippets:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = (body: string) => {
    onInsert(body);
    setOpen(false);
    setSearchQuery("");
  };

  const filteredSnippets: SnippetsByCategory = {};
  Object.entries(snippets).forEach(([category, items]) => {
    const filtered = items.filter((snippet) =>
      searchQuery === "" ||
      snippet.body.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (filtered.length > 0) {
      filteredSnippets[category] = filtered;
    }
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <MessageSquare className="h-4 w-4 mr-2" />
            Insert Snippet
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start">
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search snippets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg bg-background text-sm"
            />
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Loading snippets...
            </div>
          ) : Object.keys(filteredSnippets).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No snippets found
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(filteredSnippets).map(([category, items]) => (
                <div key={category}>
                  <div className="mb-2">
                    <Badge variant="secondary" className="text-xs">
                      {CATEGORY_LABELS[category] || category}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {items.map((snippet) => (
                      <button
                        key={snippet.id}
                        onClick={() => handleInsert(snippet.body)}
                        className="w-full text-left p-3 border rounded-lg hover:bg-muted/50 transition-colors text-sm"
                      >
                        {snippet.body}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}





























































