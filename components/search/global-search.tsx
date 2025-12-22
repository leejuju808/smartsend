"use client";

import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Building2,
  MessageSquare,
  FileText,
  CheckSquare,
  Zap,
  Mail,
  Briefcase,
  Sparkles,
} from "lucide-react";

type SearchResultItem = {
  id: string;
  type: "lead" | "company" | "thread" | "note" | "task" | "campaign" | "deal" | "template";
  name: string;
  secondary?: string;
  url: string;
  score?: number;
  updated_at?: string;
};

type SearchResponse = {
  leads: SearchResultItem[];
  companies: SearchResultItem[];
  campaigns: SearchResultItem[];
  deals: SearchResultItem[];
  threads: SearchResultItem[];
  templates: SearchResultItem[];
};

// Icon mapping for each result type
const typeIcons = {
  lead: Users,
  company: Building2,
  thread: MessageSquare,
  note: FileText,
  task: CheckSquare,
  campaign: Zap,
  deal: Briefcase,
  template: Sparkles,
};

// Type labels for display
const typeLabels = {
  lead: "Leads",
  company: "Companies",
  thread: "Threads",
  note: "Notes",
  task: "Tasks",
  campaign: "Campaigns",
  deal: "Deals",
  template: "Templates",
};

// Type order for ranking (threads > leads > companies > deals > campaigns > templates)
const typeOrder: Array<keyof typeof typeLabels> = [
  "thread",
  "lead",
  "company",
  "deal",
  "campaign",
  "template",
];

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Load recent objects from localStorage
  const [recentObjects, setRecentObjects] = useState<SearchResultItem[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("smartsend_recent_objects");
      if (stored) {
        setRecentObjects(JSON.parse(stored));
      }
    } catch (e) {
      // Ignore parse errors
    }
  }, []);

  useEffect(() => {
    if (!q || q.trim().length === 0) {
      setData(null);
      return;
    }

    const timeoutId = setTimeout(() => {
      setIsLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((result: SearchResponse) => {
          setData(result);
          setIsLoading(false);
        })
        .catch(() => {
          setIsLoading(false);
        });
    }, 300); // Debounce

    return () => clearTimeout(timeoutId);
  }, [q]);

  // Handle Cmd+K keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Track recent objects when selecting a result
  const handleSelect = (item: SearchResultItem) => {
    try {
      const stored = localStorage.getItem("smartsend_recent_objects");
      const recent = stored ? JSON.parse(stored) : [];
      // Remove if already exists
      const filtered = recent.filter((r: SearchResultItem) => r.id !== item.id);
      // Add to front
      const updated = [{ ...item, name: item.name || "Untitled" }, ...filtered].slice(0, 10);
      localStorage.setItem("smartsend_recent_objects", JSON.stringify(updated));
      setRecentObjects(updated);
    } catch (e) {
      // Ignore errors
    }
    router.push(item.url);
    setOpen(false);
  };

  // Group results by type for display
  const groupedResults: Record<string, SearchResultItem[]> = {
    lead: data?.leads || [],
    company: data?.companies || [],
    campaign: data?.campaigns || [],
    deal: data?.deals || [],
    thread: data?.threads || [],
    template: data?.templates || [],
  };

  const hasResults = data && (
    (data.leads && data.leads.length > 0) ||
    (data.companies && data.companies.length > 0) ||
    (data.campaigns && data.campaigns.length > 0) ||
    (data.deals && data.deals.length > 0) ||
    (data.threads && data.threads.length > 0) ||
    (data.templates && data.templates.length > 0)
  );

  return (
    <>
      <kbd
        onClick={() => setOpen(true)}
        className="pointer-events-none fixed right-4 top-4 z-50 hidden h-8 items-center gap-1 rounded border bg-muted px-2 font-mono text-[10px] font-medium opacity-100 sm:flex"
      >
        <span className="text-xs">⌘</span>K
      </kbd>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command value={q} onValueChange={setQ}>
          <CommandInput
            placeholder="Search leads, companies, campaigns, deals, threads, templates…"
            value={q}
            onValueChange={setQ}
          />
          <CommandList>
            {isLoading && q.trim().length > 0 ? (
              <CommandEmpty>Searching…</CommandEmpty>
            ) : !q.trim() && recentObjects.length > 0 ? (
              <>
                <CommandGroup heading="Recent">
                  {recentObjects.map((item) => {
                    const Icon = typeIcons[item.type as keyof typeof typeIcons];
                    return (
                      <CommandItem
                        key={item.id}
                        onSelect={() => handleSelect(item)}
                        className="flex items-center gap-2"
                      >
                        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
                        <div className="flex-1">
                          <div className="font-medium">{item.name}</div>
                          {item.secondary && (
                            <div className="text-xs text-muted-foreground">{item.secondary}</div>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            ) : !hasResults && q.trim().length > 0 ? (
              <CommandEmpty>No results found.</CommandEmpty>
            ) : hasResults ? (
              <>
                {typeOrder.map((type) => {
                  const items = groupedResults[type] || [];
                  if (items.length === 0) return null;

                  const Icon = typeIcons[type];
                  const label = typeLabels[type];

                  return (
                    <CommandGroup key={type} heading={label}>
                      {items.map((item) => (
                        <CommandItem
                          key={item.id}
                          onSelect={() => handleSelect(item)}
                          className="flex items-center gap-2"
                        >
                          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
                          <div className="flex-1">
                            <div className="font-medium">{item.name}</div>
                            {item.secondary && (
                              <div className="text-xs text-muted-foreground">{item.secondary}</div>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  );
                })}
              </>
            ) : null}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}

