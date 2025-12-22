"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { listCampaignsMin, type CampaignMin } from "@/app/api/campaigns/list-min/actions";

interface InboxFilterBarProps {
  accountId: string;
}

interface Mailbox {
  id: string;
  email: string;
}

export function InboxFilterBar({ accountId }: InboxFilterBarProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [campaigns, setCampaigns] = useState<CampaignMin[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [loadingMailboxes, setLoadingMailboxes] = useState(false);
  const [companyInput, setCompanyInput] = useState("");
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    async function loadCampaigns() {
      if (accountId) {
        setLoadingCampaigns(true);
        try {
          const data = await listCampaignsMin(accountId);
          setCampaigns(data);
        } catch (err) {
          console.error("Failed to load campaigns:", err);
        } finally {
          setLoadingCampaigns(false);
        }
      }
    }
    loadCampaigns();
  }, [accountId]);

  useEffect(() => {
    async function loadMailboxes() {
      if (accountId) {
        setLoadingMailboxes(true);
        try {
          // Fetch send_identities (which reply_threads.identity_id references)
          // Try multiple endpoints to find the right one
          let res = await fetch("/api/mailboxes");
          if (!res.ok) {
            // Try alternative endpoint
            res = await fetch(`/api/identities?account_id=${accountId}`);
          }
          if (res.ok) {
            const data = await res.json();
            // Handle different response formats
            if (data.mailboxes) {
              setMailboxes(data.mailboxes.map((m: any) => ({ id: m.id, email: m.email || m.from_email || m.email_from })));
            } else if (data.identities) {
              setMailboxes(data.identities.map((i: any) => ({ id: i.id, email: i.email || i.from_email || i.email_from })));
            } else if (Array.isArray(data)) {
              setMailboxes(data.map((item: any) => ({ id: item.id, email: item.email || item.from_email || item.email_from })));
            }
          }
        } catch (err) {
          console.error("Failed to load mailboxes:", err);
          // Silently fail - mailbox filter will just not show
        } finally {
          setLoadingMailboxes(false);
        }
      }
    }
    loadMailboxes();
  }, [accountId]);

  function updateFilter(key: string, value: string | null) {
    const newParams = new URLSearchParams(params.toString());
    if (!value || value === "") {
      newParams.delete(key);
    } else {
      newParams.set(key, value);
    }
    // Reset to page 1 when filters change
    newParams.delete("page");
    router.push(`/replies?${newParams.toString()}`);
  }

  function clearAllFilters() {
    router.push("/replies");
  }

  const currentIntent = params.get("intent") || "";
  const currentCampaign = params.get("campaign") || params.get("campaign_id") || "";
  const currentScoreBucket = params.get("score_bucket") || "";
  const currentDate = params.get("date") || "";
  const currentCompany = params.get("company") || "";
  const currentTag = params.get("tag") || "";
  const currentMailbox = params.get("mailbox") || "";
  const currentSearch = params.get("q") || "";
  const currentArchived = params.get("archived") || "";
  const currentDone = params.get("done") || "";
  const currentImportant = params.get("important") || "";
  const currentAssigned = params.get("assigned_to") || "";

  // Sync input fields with URL params
  useEffect(() => {
    setCompanyInput(currentCompany);
  }, [currentCompany]);

  useEffect(() => {
    setTagInput(currentTag);
  }, [currentTag]);

  const hasActiveFilters =
    currentIntent ||
    currentCampaign ||
    currentScoreBucket ||
    currentDate ||
    currentCompany ||
    currentTag ||
    currentMailbox ||
    currentSearch ||
    currentArchived ||
    currentDone ||
    currentImportant ||
    currentAssigned;

  return (
    <div className="flex flex-wrap gap-3 items-center border-b p-3 bg-background sticky top-0 z-20">
      {/* Campaign Filter */}
      <Select
        value={currentCampaign || undefined}
        onValueChange={(v) => updateFilter("campaign", v || null)}
        disabled={loadingCampaigns}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder={loadingCampaigns ? "Loading..." : "Campaign"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Campaigns</SelectItem>
          {campaigns.map((campaign) => (
            <SelectItem key={campaign.id} value={campaign.id}>
              {campaign.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Intent Filter */}
      <Select
        value={currentIntent || undefined}
        onValueChange={(v) => updateFilter("intent", v || null)}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Intent" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Intents</SelectItem>
          <SelectItem value="meeting_intent">Meeting</SelectItem>
          <SelectItem value="interested">Interested</SelectItem>
          <SelectItem value="ooo">OOO</SelectItem>
          <SelectItem value="not_interested">Not Interested</SelectItem>
          <SelectItem value="unsubscribe">Unsubscribed</SelectItem>
          <SelectItem value="neutral">Neutral</SelectItem>
        </SelectContent>
      </Select>

      {/* Score Filter */}
      <Select
        value={currentScoreBucket || undefined}
        onValueChange={(v) => updateFilter("score_bucket", v || null)}
      >
        <SelectTrigger className="w-[120px]">
          <SelectValue placeholder="Score" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Scores</SelectItem>
          <SelectItem value="hot">🔥 Hot</SelectItem>
          <SelectItem value="warm">Warm</SelectItem>
          <SelectItem value="cool">Cool</SelectItem>
          <SelectItem value="cold">Cold</SelectItem>
        </SelectContent>
      </Select>

      {/* Time Filter */}
      <Select
        value={currentDate || undefined}
        onValueChange={(v) => updateFilter("date", v || null)}
      >
        <SelectTrigger className="w-[100px]">
          <SelectValue placeholder="Time" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Time</SelectItem>
          <SelectItem value="24h">24h</SelectItem>
          <SelectItem value="3d">3d</SelectItem>
          <SelectItem value="7d">7d</SelectItem>
          <SelectItem value="14d">14d</SelectItem>
          <SelectItem value="30d">30d</SelectItem>
        </SelectContent>
      </Select>

      {/* Company Input Filter */}
      <Input
        placeholder="Company name"
        value={companyInput}
        onChange={(e) => {
          setCompanyInput(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            updateFilter("company", e.currentTarget.value.trim() || null);
          }
        }}
        onBlur={(e) => {
          updateFilter("company", e.target.value.trim() || null);
        }}
        className="w-[140px]"
      />

      {/* Tag Input Filter */}
      <Input
        placeholder="Tag (e.g. warm-lead)"
        value={tagInput}
        onChange={(e) => {
          setTagInput(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            updateFilter("tag", e.currentTarget.value.trim() || null);
          }
        }}
        onBlur={(e) => {
          updateFilter("tag", e.target.value.trim() || null);
        }}
        className="w-[140px]"
      />

      {/* Mailbox Filter */}
      {mailboxes.length > 0 && (
        <Select
          value={currentMailbox || undefined}
          onValueChange={(v) => updateFilter("mailbox", v || null)}
          disabled={loadingMailboxes}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={loadingMailboxes ? "Loading..." : "Mailbox"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Mailboxes</SelectItem>
            {mailboxes.map((mailbox) => (
              <SelectItem key={mailbox.id} value={mailbox.id}>
                {mailbox.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Archived Filter */}
      <Select
        value={currentArchived || undefined}
        onValueChange={(v) => updateFilter("archived", v || null)}
      >
        <SelectTrigger className="w-[120px]">
          <SelectValue placeholder="Archived" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All</SelectItem>
          <SelectItem value="false">Not Archived</SelectItem>
          <SelectItem value="true">Archived</SelectItem>
        </SelectContent>
      </Select>

      {/* Done Filter */}
      <Select
        value={currentDone || undefined}
        onValueChange={(v) => updateFilter("done", v || null)}
      >
        <SelectTrigger className="w-[100px]">
          <SelectValue placeholder="Done" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All</SelectItem>
          <SelectItem value="false">Not Done</SelectItem>
          <SelectItem value="true">Done</SelectItem>
        </SelectContent>
      </Select>

      {/* Important Filter */}
      <Select
        value={currentImportant || undefined}
        onValueChange={(v) => updateFilter("important", v || null)}
      >
        <SelectTrigger className="w-[120px]">
          <SelectValue placeholder="Important" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All</SelectItem>
          <SelectItem value="false">Not Important</SelectItem>
          <SelectItem value="true">Important</SelectItem>
        </SelectContent>
      </Select>

      {/* Assigned Filter */}
      <Select
        value={currentAssigned || undefined}
        onValueChange={(v) => updateFilter("assigned_to", v || null)}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Assigned" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All</SelectItem>
          <SelectItem value="me">Assigned to me</SelectItem>
          <SelectItem value="unassigned">Unassigned</SelectItem>
        </SelectContent>
      </Select>

      {/* Clear All Filters Button */}
      {hasActiveFilters && (
        <Button variant="ghost" onClick={clearAllFilters} className="ml-auto">
          Clear
        </Button>
      )}
    </div>
  );
}

