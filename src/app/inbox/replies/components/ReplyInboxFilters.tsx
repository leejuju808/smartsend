"use client";

import { useState, useEffect } from "react";
import type { ReplyIntent, ReplyStatus, ReplyInboxFilters, LeadStatus, ActivityFilter } from "@/types/reply-inbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface ReplyInboxFiltersProps {
  filters: ReplyInboxFilters;
  onFiltersChange: (filters: ReplyInboxFilters) => void;
}

const INTENT_OPTIONS: { value: ReplyIntent | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "follow_up", label: "Follow-Up Needed" },
  { value: "not_interested", label: "Not Interested" },
  { value: "unclassified", label: "Unclassified" },
];

const STATUS_OPTIONS: { value: ReplyStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "snoozed", label: "Snoozed" },
  { value: "closed", label: "Closed" },
  { value: "archived", label: "Archived" },
];

const LEAD_STATUS_OPTIONS: { value: LeadStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "New", label: "New" },
  { value: "Attempting", label: "Attempting" },
  { value: "Warm", label: "Warm" },
  { value: "Hot", label: "Hot" },
  { value: "Customer", label: "Customer" },
  { value: "Not Interested", label: "Not Interested" },
];

const ACTIVITY_OPTIONS: { value: ActivityFilter; label: string }[] = [
  { value: null, label: "All" },
  { value: "24h", label: "Replied in last 24h" },
  { value: "72h", label: "Replied in last 72h" },
  { value: "7d", label: "Replied in last 7 days" },
  { value: "no_reply_x", label: "No reply in X days" },
];

// Simple multi-select for tags
function TagMultiSelect({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options: { tag: string }[];
}) {
  const toggleTag = (tag: string) => {
    if (value.includes(tag)) {
      onChange(value.filter((t) => t !== tag));
    } else {
      onChange([...value, tag]);
    }
  };

  return (
    <div className="border rounded-md p-2 min-h-[40px] max-h-32 overflow-y-auto">
      {options.length === 0 ? (
        <div className="text-sm text-muted-foreground p-2">No tags available</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <div key={option.tag} className="flex items-center space-x-2">
              <Checkbox
                id={`tag-${option.tag}`}
                checked={value.includes(option.tag)}
                onCheckedChange={() => toggleTag(option.tag)}
              />
              <Label
                htmlFor={`tag-${option.tag}`}
                className="text-sm font-normal cursor-pointer"
              >
                {option.tag}
              </Label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Campaign multi-select
function CampaignMultiSelect({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options: { id: string; name: string }[];
}) {
  const toggleCampaign = (campaignId: string) => {
    if (value.includes(campaignId)) {
      onChange(value.filter((id) => id !== campaignId));
    } else {
      onChange([...value, campaignId]);
    }
  };

  return (
    <div className="border rounded-md p-2 min-h-[40px] max-h-32 overflow-y-auto">
      {options.length === 0 ? (
        <div className="text-sm text-muted-foreground p-2">No campaigns available</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <div key={option.id} className="flex items-center space-x-2">
              <Checkbox
                id={`campaign-${option.id}`}
                checked={value.includes(option.id)}
                onCheckedChange={() => toggleCampaign(option.id)}
              />
              <Label
                htmlFor={`campaign-${option.id}`}
                className="text-sm font-normal cursor-pointer"
              >
                {option.name}
              </Label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReplyInboxFilters({
  filters,
  onFiltersChange,
}: ReplyInboxFiltersProps) {
  const [workspaceMembers, setWorkspaceMembers] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([]);
  const [tags, setTags] = useState<Array<{ tag: string }>>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [loadingTags, setLoadingTags] = useState(false);
  const [showNoReplyDaysInput, setShowNoReplyDaysInput] = useState(false);

  // Calculate active filter count
  const activeFilterCount = [
    filters.intent && filters.intent !== "all" ? 1 : 0,
    filters.status && filters.status !== "all" ? 1 : 0,
    filters.tags && filters.tags.length > 0 ? 1 : 0,
    filters.leadStatus && filters.leadStatus !== "all" ? 1 : 0,
    filters.assignee && filters.assignee !== "all" ? 1 : 0,
    filters.campaignIds && filters.campaignIds.length > 0 ? 1 : 0,
    filters.activity ? 1 : 0,
    filters.q ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // Fetch workspace members, campaigns, and tags
  useEffect(() => {
    const loadData = async () => {
      setLoadingMembers(true);
      setLoadingCampaigns(true);
      setLoadingTags(true);
      
      try {
        // Load workspace members
        const membersRes = await fetch("/api/inbox/workspace-members");
        if (membersRes.ok) {
          const membersData = await membersRes.json();
          setWorkspaceMembers(membersData.members || []);
        }

        // Load campaigns
        const campaignsRes = await fetch("/api/campaigns/list");
        if (campaignsRes.ok) {
          const campaignsData = await campaignsRes.json();
          setCampaigns(campaignsData.campaigns || []);
        }

        // Load tags
        const tagsRes = await fetch("/api/tags");
        if (tagsRes.ok) {
          const tagsData = await tagsRes.json();
          setTags((tagsData.tags || []).map((t: any) => ({ tag: t.tag || t.name || t })));
        }
      } catch (err) {
        console.error("Failed to load filter data:", err);
      } finally {
        setLoadingMembers(false);
        setLoadingCampaigns(false);
        setLoadingTags(false);
      }
    };
    loadData();
  }, []);

  // Show no_reply_x input when activity is set to no_reply_x
  useEffect(() => {
    setShowNoReplyDaysInput(filters.activity === "no_reply_x");
  }, [filters.activity]);

  const clearAllFilters = () => {
    onFiltersChange({
      status: "open", // Keep default status
    });
  };

  return (
    <div className="border-b bg-muted/50 px-6 py-3">
      {/* Filter count badge and clear button */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Filters</span>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {activeFilterCount}
            </Badge>
          )}
        </div>
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="h-7 text-xs"
          >
            Clear All
          </Button>
        )}
      </div>

      {/* Filter controls */}
      <div className="flex flex-wrap items-start gap-4">
        {/* Intent Filter */}
        <div className="flex flex-col gap-1 min-w-[140px]">
          <Label className="text-xs font-medium">Intent</Label>
          <Select
            value={filters.intent === "all" || !filters.intent ? "all" : Array.isArray(filters.intent) ? "all" : filters.intent}
            onValueChange={(value) =>
              onFiltersChange({
                ...filters,
                intent: value === "all" ? "all" : (value as ReplyIntent),
              })
            }
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTENT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Thread Status Filter */}
        <div className="flex flex-col gap-1 min-w-[140px]">
          <Label className="text-xs font-medium">Thread Status</Label>
          <Select
            value={filters.status || "all"}
            onValueChange={(value) =>
              onFiltersChange({
                ...filters,
                status: value === "all" ? "all" : (value as ReplyStatus),
              })
            }
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Lead Status Filter */}
        <div className="flex flex-col gap-1 min-w-[140px]">
          <Label className="text-xs font-medium">Lead Status</Label>
          <Select
            value={filters.leadStatus || "all"}
            onValueChange={(value) =>
              onFiltersChange({
                ...filters,
                leadStatus: value === "all" ? "all" : (value as LeadStatus),
              })
            }
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Assignment Filter */}
        <div className="flex flex-col gap-1 min-w-[160px]">
          <Label className="text-xs font-medium">Assignment</Label>
          <Select
            value={filters.assignee || filters.scope === "mine" ? "me" : filters.scope === "all" ? "all" : filters.assignee || "all"}
            onValueChange={(value) => {
              onFiltersChange({
                ...filters,
                assignee: value === "all" ? undefined : value,
                scope: undefined, // Clear deprecated scope
              });
            }}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              <SelectItem value="me">Assigned to Me</SelectItem>
              <SelectItem value="others">Assigned to Others</SelectItem>
              {workspaceMembers.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name || member.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Campaign Filter */}
        <div className="flex flex-col gap-1 min-w-[200px]">
          <Label className="text-xs font-medium">Campaign</Label>
          <CampaignMultiSelect
            value={filters.campaignIds || []}
            onChange={(ids) =>
              onFiltersChange({
                ...filters,
                campaignIds: ids.length > 0 ? ids : undefined,
                campaignId: undefined, // Clear single campaign if using multi
              })
            }
            options={campaigns}
          />
        </div>

        {/* Tags Filter */}
        <div className="flex flex-col gap-1 min-w-[200px]">
          <Label className="text-xs font-medium">Tags</Label>
          <TagMultiSelect
            value={filters.tags || []}
            onChange={(tags) =>
              onFiltersChange({
                ...filters,
                tags: tags.length > 0 ? tags : undefined,
              })
            }
            options={tags}
          />
        </div>

        {/* Activity Filter */}
        <div className="flex flex-col gap-1 min-w-[180px]">
          <Label className="text-xs font-medium">Activity</Label>
          <Select
            value={filters.activity || ""}
            onValueChange={(value) =>
              onFiltersChange({
                ...filters,
                activity: value === "" ? undefined : (value as ActivityFilter),
                daysWithoutReply: value === "no_reply_x" ? filters.daysWithoutReply || 7 : undefined,
              })
            }
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value || ""} value={opt.value || ""}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {showNoReplyDaysInput && (
            <div className="mt-1">
              <Input
                type="number"
                placeholder="Days"
                value={filters.daysWithoutReply || ""}
                onChange={(e) =>
                  onFiltersChange({
                    ...filters,
                    daysWithoutReply: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                className="h-8 text-sm"
                min="1"
              />
            </div>
          )}
        </div>

        {/* Search */}
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <Label className="text-xs font-medium">Search</Label>
          <Input
            placeholder="Search contact name, email, or message..."
            value={filters.q || ""}
            onChange={(e) =>
              onFiltersChange({ ...filters, q: e.target.value || undefined })
            }
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* Active filter chips (optional V2) */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
          {filters.intent && filters.intent !== "all" && (
            <Badge variant="secondary" className="text-xs">
              Intent: {INTENT_OPTIONS.find((o) => o.value === filters.intent)?.label || filters.intent}
              <button
                onClick={() => onFiltersChange({ ...filters, intent: "all" })}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.status && filters.status !== "all" && (
            <Badge variant="secondary" className="text-xs">
              Status: {STATUS_OPTIONS.find((o) => o.value === filters.status)?.label || filters.status}
              <button
                onClick={() => onFiltersChange({ ...filters, status: "all" })}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.leadStatus && filters.leadStatus !== "all" && (
            <Badge variant="secondary" className="text-xs">
              Lead: {LEAD_STATUS_OPTIONS.find((o) => o.value === filters.leadStatus)?.label || filters.leadStatus}
              <button
                onClick={() => onFiltersChange({ ...filters, leadStatus: "all" })}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.assignee && filters.assignee !== "all" && (
            <Badge variant="secondary" className="text-xs">
              {filters.assignee === "me" ? "Assigned to Me" : filters.assignee === "unassigned" ? "Unassigned" : filters.assignee === "others" ? "Assigned to Others" : "Assigned"}
              <button
                onClick={() => onFiltersChange({ ...filters, assignee: undefined })}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.campaignIds && filters.campaignIds.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              Campaigns ({filters.campaignIds.length})
              <button
                onClick={() => onFiltersChange({ ...filters, campaignIds: undefined })}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.tags && filters.tags.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              Tags ({filters.tags.length})
              <button
                onClick={() => onFiltersChange({ ...filters, tags: undefined })}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.activity && (
            <Badge variant="secondary" className="text-xs">
              {ACTIVITY_OPTIONS.find((o) => o.value === filters.activity)?.label || filters.activity}
              {filters.activity === "no_reply_x" && filters.daysWithoutReply && ` (${filters.daysWithoutReply}d)`}
              <button
                onClick={() => onFiltersChange({ ...filters, activity: undefined, daysWithoutReply: undefined })}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
