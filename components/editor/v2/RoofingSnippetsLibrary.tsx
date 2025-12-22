"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Snippet = {
  id: string;
  category: string;
  name: string;
  snippet: string;
  description?: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  hail_damage: "Hail Damage",
  storm_activity: "Storm Activity",
  insurance: "Insurance",
  inspection_scheduling: "Inspection Scheduling",
  cta: "CTA",
  trust_authority: "Trust/Authority",
  roof_type_specific: "Roof Type Specific",
};

interface RoofingSnippetsLibraryProps {
  onInsertSnippet: (snippet: string) => void;
}

export function RoofingSnippetsLibrary({ onInsertSnippet }: RoofingSnippetsLibraryProps) {
  const [open, setOpen] = useState(false);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (open) {
      loadSnippets();
    }
  }, [open]);

  async function loadSnippets() {
    setLoading(true);
    try {
      const url = selectedCategory
        ? `/api/roofing-snippets?category=${selectedCategory}`
        : "/api/roofing-snippets";
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        setSnippets(data.snippets || []);
      }
    } catch (error) {
      console.error("Failed to load snippets:", error);
    } finally {
      setLoading(false);
    }
  }

  const categories = Array.from(new Set(snippets.map((s) => s.category)));
  const filteredSnippets = snippets.filter((snippet) => {
    const matchesSearch =
      !searchQuery ||
      snippet.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      snippet.snippet.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || snippet.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleInsert = (snippet: string) => {
    onInsertSnippet(snippet);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Insert Roofing Snippet
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Roofing Snippets Library</DialogTitle>
            <DialogDescription>
              Pre-built snippets for roofing contractors. Click to insert.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Search */}
            <Input
              placeholder="Search snippets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            {/* Category Filter */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedCategory === null ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setSelectedCategory(null);
                  loadSnippets();
                }}
              >
                All
              </Button>
              {categories.map((cat) => (
                <Button
                  key={cat}
                  variant={selectedCategory === cat ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSelectedCategory(cat);
                    loadSnippets();
                  }}
                >
                  {CATEGORY_LABELS[cat] || cat}
                </Button>
              ))}
            </div>

            {/* Snippets List */}
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : filteredSnippets.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No snippets found
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSnippets.map((snippet) => (
                  <div
                    key={snippet.id}
                    className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-medium text-sm">{snippet.name}</h4>
                        {snippet.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {snippet.description}
                          </p>
                        )}
                        <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-muted rounded">
                          {CATEGORY_LABELS[snippet.category] || snippet.category}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          handleInsert(snippet.snippet);
                          setOpen(false);
                        }}
                      >
                        Insert
                      </Button>
                    </div>
                    <div className="mt-2 p-2 bg-muted/30 rounded text-xs font-mono text-muted-foreground">
                      {snippet.snippet}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}




























































