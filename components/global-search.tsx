"use client";

import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandEmpty,
} from "@/components/ui/command";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { data, isLoading } = useSWR(
    query ? `/api/search?q=${encodeURIComponent(query)}` : null,
    fetcher
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
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

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search leads, campaigns, domains…"
        value={query}
        onValueChange={(v) => setQuery(v)}
      />

      <CommandList>
        {isLoading && query.trim().length > 0 ? (
          <CommandEmpty>Searching…</CommandEmpty>
        ) : !query.trim() ? (
          <CommandEmpty>Type to search…</CommandEmpty>
        ) : (
          <>
            {(!data?.leads?.length &&
              !data?.campaigns?.length &&
              !data?.domains?.length &&
              !data?.events?.length) && (
              <CommandEmpty>No results found.</CommandEmpty>
            )}

            {/* LEADS */}
            {data?.leads?.length > 0 && (
              <CommandGroup heading="Leads">
                {data.leads.map((l: any) => (
                  <CommandItem
                    key={l.id}
                    onSelect={() => {
                      router.push(`/leads/${l.id}`);
                      setOpen(false);
                    }}
                  >
                    {l.first_name} {l.last_name} — {l.email}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* CAMPAIGNS */}
            {data?.campaigns?.length > 0 && (
              <CommandGroup heading="Campaigns">
                {data.campaigns.map((c: any) => (
                  <CommandItem
                    key={c.id}
                    onSelect={() => {
                      router.push(`/campaigns/${c.id}`);
                      setOpen(false);
                    }}
                  >
                    {c.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* DOMAINS */}
            {data?.domains?.length > 0 && (
              <CommandGroup heading="Sender Identities">
                {data.domains.map((d: any) => (
                  <CommandItem
                    key={d.id}
                    onSelect={() => {
                      router.push(`/settings/senders/${d.id}`);
                      setOpen(false);
                    }}
                  >
                    {d.email_address}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* EVENTS */}
            {data?.events?.length > 0 && (
              <CommandGroup heading="Recent Email Activity">
                {data.events.map((ev: any) => (
                  <CommandItem
                    key={ev.id}
                    onSelect={() => {
                      if (ev.lead_id) {
                        router.push(`/leads/${ev.lead_id}`);
                      }
                      setOpen(false);
                    }}
                  >
                    {ev.event_type?.toUpperCase()} — {ev.subject || "No subject"}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}



