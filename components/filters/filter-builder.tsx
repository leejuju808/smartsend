"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import useSWR from "swr";

export type FilterState = {
  tags?: string[];
  stage_id?: string;
  intent?: string;
  opened_min?: number;
  replied?: boolean;
  clicked?: boolean;
  has_linkedin?: boolean;
  no_reply_days?: number;
  score_bucket?: "hot" | "warm" | "cool" | "cold";
  score_min?: number;
};

type FilterBuilderProps = {
  filter: FilterState;
  setFilter: (filter: FilterState) => void;
  workspaceId?: string;
};

// Multi-select component for tags
function MultiSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  options: { id: string; name: string }[];
}) {
  const toggleTag = (tagId: string) => {
    if (value.includes(tagId)) {
      onChange(value.filter((id) => id !== tagId));
    } else {
      onChange([...value, tagId]);
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="border rounded-md p-2 min-h-[40px] max-h-32 overflow-y-auto">
        {options.length === 0 ? (
          <div className="text-sm text-muted-foreground p-2">No tags available</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {options.map((option) => (
              <div key={option.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`tag-${option.id}`}
                  checked={value.includes(option.id)}
                  onCheckedChange={() => toggleTag(option.id)}
                />
                <Label
                  htmlFor={`tag-${option.id}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {option.name}
                </Label>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Stage dropdown component
function StageDropdown({
  value,
  onChange,
  workspaceId,
}: {
  value?: string;
  onChange: (value: string) => void;
  workspaceId?: string;
}) {
  // For now, we'll use a simple select. In a real implementation, you'd fetch stages from API
  const stages = [
    { id: "contacted", name: "Contacted" },
    { id: "replied", name: "Replied" },
    { id: "demo_scheduled", name: "Demo Scheduled" },
    { id: "closed", name: "Closed" },
  ];

  return (
    <div className="space-y-2">
      <Label>Stage</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select stage" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Stages</SelectItem>
          {stages.map((stage) => (
            <SelectItem key={stage.id} value={stage.id}>
              {stage.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function FilterBuilder({ filter, setFilter, workspaceId }: FilterBuilderProps) {
  // Fetch tags
  const { data: tagsData } = useSWR<{ tags: { id: string; name: string }[] }>(
    workspaceId ? `/api/tags?workspace_id=${workspaceId}` : null
  );

  const tags = tagsData?.tags ?? [];

  return (
    <div className="space-y-4">
      {/* Tags */}
      <MultiSelect
        label="Tags"
        value={filter.tags || []}
        onChange={(v) => setFilter({ ...filter, tags: v })}
        options={tags}
      />

      {/* Intent */}
      <div className="space-y-2">
        <Label>Intent</Label>
        <Select
          value={filter.intent || ""}
          onValueChange={(v) => setFilter({ ...filter, intent: v || undefined })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select intent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Intents</SelectItem>
            <SelectItem value="meeting_intent">Meeting Intent</SelectItem>
            <SelectItem value="interested">Interested</SelectItem>
            <SelectItem value="not_interested">Not Interested</SelectItem>
            <SelectItem value="question">Question</SelectItem>
            <SelectItem value="out_of_office">Out of Office</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stage */}
      <StageDropdown
        value={filter.stage_id}
        onChange={(v) => setFilter({ ...filter, stage_id: v || undefined })}
        workspaceId={workspaceId}
      />

      {/* Open count */}
      <div className="space-y-2">
        <Label>Min Opens</Label>
        <Input
          type="number"
          placeholder="Minimum opens"
          value={filter.opened_min || ""}
          onChange={(e) =>
            setFilter({
              ...filter,
              opened_min: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
      </div>

      {/* Replied */}
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="replied"
            checked={filter.replied === true}
            onCheckedChange={(checked) =>
              setFilter({ ...filter, replied: checked ? true : undefined })
            }
          />
          <Label htmlFor="replied" className="font-normal cursor-pointer">
            Has replied
          </Label>
        </div>
      </div>

      {/* Clicked */}
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="clicked"
            checked={filter.clicked === true}
            onCheckedChange={(checked) =>
              setFilter({ ...filter, clicked: checked ? true : undefined })
            }
          />
          <Label htmlFor="clicked" className="font-normal cursor-pointer">
            Has clicked
          </Label>
        </div>
      </div>

      {/* Has LinkedIn */}
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="has_linkedin"
            checked={filter.has_linkedin === true}
            onCheckedChange={(checked) =>
              setFilter({ ...filter, has_linkedin: checked ? true : undefined })
            }
          />
          <Label htmlFor="has_linkedin" className="font-normal cursor-pointer">
            Has LinkedIn
          </Label>
        </div>
      </div>

      {/* No reply in X days */}
      <div className="space-y-2">
        <Label>No reply in (days)</Label>
        <Input
          type="number"
          placeholder="Days"
          value={filter.no_reply_days || ""}
          onChange={(e) =>
            setFilter({
              ...filter,
              no_reply_days: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
      </div>

      {/* Clear filters button */}
      {(filter.tags?.length ||
        filter.stage_id ||
        filter.intent ||
        filter.opened_min ||
        filter.replied !== undefined ||
        filter.clicked !== undefined ||
        filter.has_linkedin !== undefined ||
        filter.no_reply_days) && (
        <Button
          variant="outline"
          onClick={() => setFilter({})}
          className="w-full"
        >
          Clear Filters
        </Button>
      )}
    </div>
  );
}

