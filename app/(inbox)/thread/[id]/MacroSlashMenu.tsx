/* eslint-disable no-restricted-syntax */
"use client";

import * as React from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type MacroItem = {
  id: string;
  key: string;
  title: string;
  body: string;
  tags?: string[] | null;
  is_active?: boolean;
};

type MacroSlashMenuProps = {
  campaignId: string;
  threadId: string;
  onInsert: (text: string) => void;
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
};

export function MacroSlashMenu({
  campaignId,
  threadId,
  onInsert,
  open: controlledOpen,
  onOpenChange,
}: MacroSlashMenuProps) {
  const [items, setItems] = React.useState<MacroItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [internalOpen, setInternalOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const open = controlledOpen ?? internalOpen;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (onOpenChange) {
        onOpenChange(next);
      } else {
        setInternalOpen(next);
      }
    },
    [onOpenChange],
  );

  const ensureItems = React.useCallback(async () => {
    if (items.length || loading) return;
    setLoading(true);
    try {
      const search = query ? `?q=${encodeURIComponent(query)}` : "";
      const response = await fetch(`/api/macros/${campaignId}/list${search}`, {
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) return;
      const data = (await response.json()) as MacroItem[];
      setItems(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [campaignId, items.length, loading, query]);

  React.useEffect(() => {
    if (!open) return;
    void ensureItems();
  }, [ensureItems, open]);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const active = document.activeElement;
      const inTextualInput =
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLInputElement && active.type === "text") ||
        (active instanceof HTMLDivElement && active.getAttribute("role") === "textbox");

      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (!open && inTextualInput) {
          event.preventDefault();
          setQuery("");
          setOpen(true);
          void ensureItems();
        }
      }

      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ensureItems, open, setOpen]);

  const handleInsert = React.useCallback(
    async (macroId: string) => {
      const response = await fetch("/api/macros/insert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: threadId, macro_id: macroId }),
      });
      if (!response.ok) return;
      const payload = await response.json();
      const body = typeof payload?.body === "string" ? payload.body : "";
      if (body) {
        onInsert(body);
      }
      setOpen(false);
    },
    [onInsert, setOpen, threadId],
  );

  if (!open) return null;

  const filtered = query
    ? items.filter((item) => {
        const lower = query.toLowerCase();
        return (
          item.key.toLowerCase().includes(lower) ||
          item.title.toLowerCase().includes(lower) ||
          (item.tags ?? []).some((tag) => tag.toLowerCase().includes(lower))
        );
      })
    : items;

  return (
    <div className="absolute bottom-16 left-6 z-50 w-[420px] rounded-2xl border bg-background shadow-xl">
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Type a macro (e.g., clarify, pricing)…"
          value={query}
          onValueChange={setQuery}
          autoFocus
        />
        <CommandList>
          <CommandEmpty>{loading ? "Loading macros…" : "No macros found"}</CommandEmpty>
          <CommandGroup>
            {filtered.map((item) => (
              <CommandItem key={item.id} value={item.id} onSelect={() => handleInsert(item.id)}>
                <span className="mr-2 font-medium">/{item.key}</span>
                <span className="flex-1 truncate">{item.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}


