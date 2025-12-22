"use client";

import * as React from "react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
  CommandGroup,
} from "@/components/ui/command";

const OPTIONS = [
  { key: "shorten", label: "Shorten" },
  { key: "expand", label: "Expand" },
  { key: "clarify", label: "Clarify" },
  { key: "friendlier", label: "Friendlier" },
  { key: "formal", label: "More formal" },
  { key: "bulletize", label: "Bulletize" },
  { key: "fix", label: "Fix typos" },
];

export function AiSlashMenu({
  open,
  setOpen,
  onSubmit,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onSubmit: (action: string, extra?: string) => void;
}) {
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  if (!open) return null;

  const needle = (query || "").split(" ")[0]?.toLowerCase() ?? "";

  return (
    <div className="absolute bottom-14 left-6 z-50 w-[460px] rounded-2xl border bg-background shadow-xl">
      <Command>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Type an AI action… e.g., shorten | friendlier about pricing"
        />
        <CommandList>
          <CommandEmpty>Type an action…</CommandEmpty>
          <CommandGroup heading="/ai">
            {OPTIONS.filter((o) => o.key.includes(needle)).map((o) => (
              <CommandItem
                key={o.key}
                onSelect={() => {
                  const parts = query.split(" ");
                  parts[0] = "";
                  const extra = parts.join(" ").trim() || undefined;
                  onSubmit(o.key, extra);
                  setOpen(false);
                }}
              >
                <span className="mr-2 font-medium">/ai {o.key}</span>
                <span>{o.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}







