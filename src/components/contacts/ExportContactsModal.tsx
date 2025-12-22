"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ExportContactsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId?: string;
  defaultFilters?: {
    status?: string;
    intent?: string;
    tags?: string[];
    activity?: string;
  };
}

export function ExportContactsModal({
  open,
  onOpenChange,
  campaignId,
  defaultFilters,
}: ExportContactsModalProps) {
  const [status, setStatus] = useState<string>(defaultFilters?.status || "");
  const [intent, setIntent] = useState<string>(defaultFilters?.intent || "");
  const [tags, setTags] = useState<string[]>(defaultFilters?.tags || []);
  const [activity, setActivity] = useState<string>(defaultFilters?.activity || "");
  const [dateRange, setDateRange] = useState<string>("");
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTagInput, setSelectedTagInput] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Fetch available tags
  useEffect(() => {
    if (open) {
      fetchAvailableTags();
    }
  }, [open]);

  async function fetchAvailableTags() {
    try {
      const res = await fetch("/api/contacts");
      const data = await res.json();
      if (data.ok && data.contacts) {
        const allTags = new Set<string>();
        data.contacts.forEach((c: any) => {
          if (Array.isArray(c.tags)) {
            c.tags.forEach((tag: string) => allTags.add(tag));
          }
        });
        setAvailableTags(Array.from(allTags).sort());
      }
    } catch (error) {
      console.error("Failed to fetch tags:", error);
    }
  }

  function handleAddTag() {
    const tag = selectedTagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setSelectedTagInput("");
    }
  }

  function handleRemoveTag(tagToRemove: string) {
    setTags(tags.filter((t) => t !== tagToRemove));
  }

  async function handleExport() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      
      if (status) params.set("status", status);
      if (intent) params.set("intent", intent);
      if (tags.length > 0) params.set("tags", tags.join(","));
      if (campaignId) params.set("campaignId", campaignId);
      if (activity) params.set("activity", activity);
      if (dateRange) params.set("dateRange", dateRange);
      params.set("format", "csv");

      const url = `/api/contacts/export?${params.toString()}`;
      
      // Trigger download
      window.location.href = url;
      
      // Close modal after a short delay
      setTimeout(() => {
        onOpenChange(false);
        setLoading(false);
      }, 500);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export contacts. Please try again.");
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export Contacts</DialogTitle>
          <DialogDescription>
            Export your contacts to CSV with optional filters. The file will include all contact details, tags, status, intent, and campaign information.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Lead Status Filter */}
          <div className="space-y-2">
            <Label htmlFor="status">Lead Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All statuses</SelectItem>
                <SelectItem value="New">New</SelectItem>
                <SelectItem value="Attempting">Attempting</SelectItem>
                <SelectItem value="Warm">Warm</SelectItem>
                <SelectItem value="Hot">Hot</SelectItem>
                <SelectItem value="Customer">Customer</SelectItem>
                <SelectItem value="Not Interested">Not Interested</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Intent Filter */}
          <div className="space-y-2">
            <Label htmlFor="intent">Intent</Label>
            <Select value={intent} onValueChange={setIntent}>
              <SelectTrigger id="intent">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Any</SelectItem>
                <SelectItem value="hot">Hot</SelectItem>
                <SelectItem value="warm">Warm</SelectItem>
                <SelectItem value="follow_up">Follow-up</SelectItem>
                <SelectItem value="not_interested">Not Interested</SelectItem>
                <SelectItem value="unclassified">Unclassified</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tags Filter */}
          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <div className="flex gap-2">
              <Select value={selectedTagInput} onValueChange={setSelectedTagInput}>
                <SelectTrigger id="tags">
                  <SelectValue placeholder="Select tags..." />
                </SelectTrigger>
                <SelectContent>
                  {availableTags.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={handleAddTag}
                disabled={!selectedTagInput}
              >
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-blue-600"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Campaign Filter (hidden if campaignId is provided) */}
          {!campaignId && (
            <div className="space-y-2">
              <Label htmlFor="campaign">Campaign</Label>
              <Input
                id="campaign"
                placeholder="Campaign ID (optional)"
                value=""
                disabled
                className="text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Campaign filtering is available when exporting from campaign pages
              </p>
            </div>
          )}

          {/* Activity Filter */}
          <div className="space-y-2">
            <Label htmlFor="activity">Activity</Label>
            <Select value={activity} onValueChange={setActivity}>
              <SelectTrigger id="activity">
                <SelectValue placeholder="All contacts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All contacts</SelectItem>
                <SelectItem value="replied">Has replied</SelectItem>
                <SelectItem value="not-replied">Has not replied</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date Range Filter */}
          <div className="space-y-2">
            <Label htmlFor="dateRange">Created Within</Label>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger id="dateRange">
                <SelectValue placeholder="All time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All time</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={loading}
          >
            {loading ? "Exporting..." : "Export CSV"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}





























































