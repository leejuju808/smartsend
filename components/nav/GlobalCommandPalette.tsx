"use client";

import * as React from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { useRouter } from "next/navigation";
import { Search, Inbox, Users, Calendar, Activity as ActivityIcon, Rocket } from "lucide-react";

type LeadResult = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  company: string | null;
  status: string | null;
};

type CampaignResult = {
  id: string;
  name: string;
  status: string | null;
};

type ReplyResult = {
  reply_id: string;
  lead_id: string;
  body: string;
  received_at: string;
  lead_email: string;
  company: string | null;
  category: string | null;
};

type MeetingResult = {
  id: string;
  lead_id: string;
  title: string | null;
  start_time: string | null;
  status: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
};

type ActivityResult = {
  id: string;
  event_type: string;
  description: string;
  created_at: string;
  campaign_name: string | null;
  lead_email: string | null;
  lead_company: string | null;
};

type SearchResponse = {
  leads: LeadResult[];
  campaigns: CampaignResult[];
  replies: ReplyResult[];
  meetings: MeetingResult[];
  activity: ActivityResult[];
};

export function GlobalCommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<SearchResponse>({
    leads: [],
    campaigns: [],
    replies: [],
    meetings: [],
    activity: [],
  });
  const router = useRouter();

  // Get workspaceId from localStorage or fetch it
  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const loadWorkspaceId = async () => {
      if (typeof window === "undefined") return;
      
      // Try localStorage first
      const activeWorkspace = localStorage.getItem("active_workspace");
      if (activeWorkspace) {
        setWorkspaceId(activeWorkspace);
        return;
      }

      // Fallback: fetch from API or use window.workspaceId if available
      if ((window as any).workspaceId) {
        setWorkspaceId((window as any).workspaceId);
      }
    };

    loadWorkspaceId();
  }, []);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        (e.key === "k" && (e.metaKey || e.ctrlKey)) &&
        !e.defaultPrevented
      ) {
        // Don't trigger when typing in inputs
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
          return;
        }
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runSearch = React.useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || !workspaceId) {
        setResults({
          leads: [],
          campaigns: [],
          replies: [],
          meetings: [],
          activity: [],
        });
        return;
      }
      setLoading(true);
      try {
        const res = await fetch("/api/search/global", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: trimmed,
            workspaceId: workspaceId,
          }),
        });
        const json = await res.json();
        setResults(json);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    },
    [workspaceId]
  );

  // Debounce search
  React.useEffect(() => {
    const handle = setTimeout(() => {
      runSearch(query);
    }, 200);
    return () => clearTimeout(handle);
  }, [query, runSearch]);

  const closeAnd = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const hasResults =
    results.leads.length > 0 ||
    results.campaigns.length > 0 ||
    results.replies.length > 0 ||
    results.meetings.length > 0 ||
    results.activity.length > 0;

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search leads, campaigns, replies, meetings..."
        />
        <CommandList>
          {loading && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Searching…
            </div>
          )}

          {!loading && !hasResults && query.trim() && (
            <CommandEmpty>No results found.</CommandEmpty>
          )}

          {!loading && hasResults && (
            <>
              {results.leads.length > 0 && (
                <CommandGroup heading="Leads">
                  {results.leads.map((l) => (
                    <CommandItem
                      key={l.id}
                      onSelect={() =>
                        closeAnd(() => {
                          router.push(`/dashboard/leads?leadId=${l.id}`);
                        })
                      }
                    >
                      <Users className="mr-2 h-4 w-4" />
                      <div className="flex flex-col">
                        <span className="text-sm">
                          {l.first_name} {l.last_name} · {l.email}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {l.company} {l.status && `· ${l.status}`}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {results.campaigns.length > 0 && (
                <CommandGroup heading="Campaigns">
                  {results.campaigns.map((c) => (
                    <CommandItem
                      key={c.id}
                      onSelect={() =>
                        closeAnd(() => {
                          router.push(`/dashboard/campaigns/${c.id}`);
                        })
                      }
                    >
                      <Rocket className="mr-2 h-4 w-4" />
                      <div className="flex flex-col">
                        <span className="text-sm">{c.name}</span>
                        {c.status && (
                          <span className="text-[11px] text-muted-foreground">
                            {c.status}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {results.replies.length > 0 && (
                <CommandGroup heading="Inbox Replies">
                  {results.replies.map((r) => (
                    <CommandItem
                      key={r.reply_id}
                      onSelect={() =>
                        closeAnd(() => {
                          router.push(
                            `/dashboard/inbox?leadId=${r.lead_id}&replyId=${r.reply_id}`
                          );
                        })
                      }
                    >
                      <Inbox className="mr-2 h-4 w-4" />
                      <div className="flex flex-col">
                        <span className="text-sm truncate max-w-[260px]">
                          {r.body}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {r.lead_email}
                          {r.company && ` · ${r.company}`} ·{" "}
                          {new Date(r.received_at).toLocaleString()}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {results.meetings.length > 0 && (
                <CommandGroup heading="Meetings">
                  {results.meetings.map((m) => (
                    <CommandItem
                      key={m.id}
                      onSelect={() =>
                        closeAnd(() => {
                          router.push(
                            `/dashboard/meetings?meetingId=${m.id}`
                          );
                        })
                      }
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      <div className="flex flex-col">
                        <span className="text-sm">
                          {m.title || "Meeting"} · {m.first_name} {m.last_name}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {m.company && `${m.company} · `}
                          {m.start_time &&
                            new Date(m.start_time).toLocaleString()}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {results.activity.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Recent Activity">
                    {results.activity.map((a) => (
                      <CommandItem
                        key={a.id}
                        onSelect={() =>
                          closeAnd(() => {
                            router.push("/dashboard/activity");
                          })
                        }
                      >
                        <ActivityIcon className="mr-2 h-4 w-4" />
                        <div className="flex flex-col">
                          <span className="text-sm">{a.description}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {a.campaign_name && `Campaign: ${a.campaign_name} · `}
                            {a.lead_email && `Lead: ${a.lead_email} · `}
                            {new Date(a.created_at).toLocaleString()}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}







