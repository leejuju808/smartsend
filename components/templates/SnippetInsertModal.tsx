"use client";

// Block 9300 — Template Library v1
// Snippet Insert Modal Component for Template Editors

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Scissors, Loader2 } from "lucide-react";

type Snippet = {
  id: string;
  content: string;
  placeholders: string[];
};

type SnippetsByCategory = Record<string, Snippet[]>;

const CATEGORY_LABELS: Record<string, string> = {
  weather: "Weather",
  urgency: "Urgency",
  credibility: "Credibility",
  value_prop: "Value Proposition",
  closing: "Closing",
};

interface SnippetInsertModalProps {
  onInsert: (snippet: string) => void;
  trigger?: React.ReactNode;
}

export function SnippetInsertModal({ onInsert, trigger }: SnippetInsertModalProps) {
  const [open, setOpen] = useState(false);
  const [snippets, setSnippets] = useState<SnippetsByCategory>({});
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  useEffect(() => {
    if (open) {
      loadSnippets();
    }
  }, [open]);

  const loadSnippets = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/snippets");
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

  const handleInsert = (snippet: Snippet) => {
    onInsert(snippet.content);
    setOpen(false);
    setSearchQuery("");
  };

  const filteredSnippets = Object.entries(snippets).reduce((acc, [category, categorySnippets]) => {
    const filtered = categorySnippets.filter((snippet) => {
      const matchesCategory = selectedCategory === "all" || category === selectedCategory;
      const matchesSearch = searchQuery === "" || 
        snippet.content.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
    
    if (filtered.length > 0) {
      acc[category] = filtered;
    }
    
    return acc;
  }, {} as SnippetsByCategory);

  const categories = Object.keys(snippets);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Scissors className="h-4 w-4 mr-2" />
            Insert Snippet
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Insert Snippet</DialogTitle>
          <DialogDescription>
            Choose a snippet to insert into your template at the cursor location.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search snippets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Category Filter */}
        {categories.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            <Button
              variant={selectedCategory === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory("all")}
            >
              All
            </Button>
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
              >
                {CATEGORY_LABELS[category] || category}
              </Button>
            ))}
          </div>
        )}

        {/* Snippets List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : Object.keys(filteredSnippets).length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No snippets found.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(filteredSnippets).map(([category, categorySnippets]) => (
              <div key={category}>
                <h3 className="text-sm font-semibold mb-3">
                  {CATEGORY_LABELS[category] || category}
                </h3>
                <div className="space-y-2">
                  {categorySnippets.map((snippet) => (
                    <div
                      key={snippet.id}
                      className="border rounded-lg p-3 hover:bg-muted transition-colors cursor-pointer"
                      onClick={() => handleInsert(snippet)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm flex-1">{snippet.content}</p>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInsert(snippet);
                          }}
                        >
                          Insert
                        </Button>
                      </div>
                      {snippet.placeholders && snippet.placeholders.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {snippet.placeholders.map((placeholder, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {placeholder}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
























































