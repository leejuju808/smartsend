"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCard } from "./MessageCard";
import { IntentFilter } from "./IntentFilter";
import { Inbox, Search } from "lucide-react";

type Message = {
  id: string;
  subject: string;
  bodySnippet: string;
  sender: string;
  senderEmail: string;
  intent: string;
  replied: boolean;
  requiresFollowup: boolean;
  createdAt: string;
  readAt: string | null;
  lead: {
    id: string;
    name: string;
    email: string;
    status: string;
  } | null;
  campaign: {
    id: string;
    name: string;
  } | null;
};

type Filter = 
  | "all" 
  | "hot_lead" 
  | "warm_lead" 
  | "price_question" 
  | "follow_up_required" 
  | "not_interested" 
  | "referral";

export function UnifiedInboxView({
  onSelectMessage,
  selectedMessageId,
}: {
  onSelectMessage: (id: string) => void;
  selectedMessageId: string | null;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>((sp.get("filter") as Filter) || "all");
  const [search, setSearch] = useState(sp.get("search") || "");
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadMessages();
  }, [filter, search]);

  // Keep local state aligned with URL (deep-link to a specific filter/search).
  useEffect(() => {
    const f = (sp.get("filter") as Filter) || "all";
    const q = sp.get("search") || "";
    if (f !== filter) setFilter(f);
    if (q !== search) setSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  // Write filter/search back to URL so the inbox is shareable.
  useEffect(() => {
    const p = new URLSearchParams(sp.toString());
    if (filter) p.set("filter", filter);
    if (search) p.set("search", search);
    else p.delete("search");
    router.replace(`/dashboard/inbox-unified?${p.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search]);

  async function loadMessages() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        filter,
        limit: "50",
        ...(search && { search }),
      });

      const res = await fetch(`/api/inbox/unified?${params}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setCounts(data.counts || {});
      }
    } catch (error) {
      console.error("Error loading messages:", error);
    } finally {
      setLoading(false);
    }
  }

  const unreadCount = messages.filter((m) => !m.readAt).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Inbox className="h-6 w-6" />
              AI Inbox
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Unified inbox with AI intent classification
            </p>
          </div>
          {unreadCount > 0 && (
            <Badge variant="default" className="text-lg px-3 py-1">
              {unreadCount} unread
            </Badge>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search messages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Filters */}
      <IntentFilter filter={filter} onFilterChange={setFilter} counts={counts} />

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <div className="text-center text-muted-foreground py-8">
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Inbox className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No messages</h3>
              <p className="text-sm text-muted-foreground">
                {filter === "all"
                  ? "You don't have any messages yet."
                  : `No messages with "${filter}" intent.`}
              </p>
            </CardContent>
          </Card>
        ) : (
          messages.map((message) => (
            <MessageCard
              key={message.id}
              message={message}
              isSelected={selectedMessageId === message.id}
              onClick={() => onSelectMessage(message.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}


































