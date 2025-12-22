"use client";

import { useState, useEffect } from "react";
import { X, Filter } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";
import { createClientComponentClient } from "@supabase/supabase-js";

export interface SearchFilters {
  status?: string[];
  lead_score_min?: number;
  lead_score_max?: number;
  tags?: string[];
  cities?: string[];
  neighborhoods?: string[];
  list_ids?: string[];
  storm_exposure?: string[];
  email_status?: string;
  task_status?: string;
  pipeline_stage?: string[];
}

interface AdvancedFiltersDrawerProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  onApply?: () => void;
}

export function AdvancedFiltersDrawer({
  open: controlledOpen,
  onOpenChange,
  filters,
  onFiltersChange,
  onApply,
}: AdvancedFiltersDrawerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<SearchFilters>(filters);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [availableNeighborhoods, setAvailableNeighborhoods] = useState<string[]>([]);
  const [availableLists, setAvailableLists] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (value: boolean) => {
    if (controlledOpen === undefined) {
      setInternalOpen(value);
    }
    onOpenChange?.(value);
  };

  const supabase = createClientComponentClient();

  // Load filter options
  useEffect(() => {
    if (open) {
      loadFilterOptions();
    }
  }, [open]);

  // Sync local filters with props
  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const loadFilterOptions = async () => {
    setLoading(true);
    try {
      // Get workspace ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("workspace_id")
        .eq("id", user.id)
        .single();

      if (!profile?.workspace_id) return;

      const workspaceId = profile.workspace_id;

      // Load tags (from contacts)
      const { data: contacts } = await supabase
        .from("contacts")
        .select("tags")
        .eq("workspace_id", workspaceId)
        .not("tags", "is", null)
        .limit(1000);

      const tagSet = new Set<string>();
      contacts?.forEach((c) => {
        if (Array.isArray(c.tags)) {
          c.tags.forEach((tag: string) => tagSet.add(tag));
        }
      });
      setAvailableTags(Array.from(tagSet).sort());

      // Load cities
      const { data: cityData } = await supabase
        .from("contacts")
        .select("city")
        .eq("workspace_id", workspaceId)
        .not("city", "is", null)
        .limit(1000);

      const citySet = new Set<string>();
      cityData?.forEach((c) => {
        if (c.city) citySet.add(c.city);
      });
      setAvailableCities(Array.from(citySet).sort());

      // Load neighborhoods (from enrichment)
      const { data: enrichmentData } = await supabase
        .from("contact_enrichment")
        .select("inferred_neighborhood")
        .not("inferred_neighborhood", "is", null)
        .limit(1000);

      const neighborhoodSet = new Set<string>();
      enrichmentData?.forEach((e) => {
        if (e.inferred_neighborhood) neighborhoodSet.add(e.inferred_neighborhood);
      });
      setAvailableNeighborhoods(Array.from(neighborhoodSet).sort());

      // Load lists
      const { data: lists } = await supabase
        .from("contact_lists")
        .select("id, name")
        .eq("workspace_id", workspaceId)
        .order("name");

      setAvailableLists(lists || []);
    } catch (error) {
      console.error("Error loading filter options:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateFilter = <K extends keyof SearchFilters>(
    key: K,
    value: SearchFilters[K]
  ) => {
    setLocalFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const toggleArrayFilter = (key: "status" | "tags" | "cities" | "neighborhoods" | "list_ids" | "storm_exposure" | "pipeline_stage", value: string) => {
    setLocalFilters((prev) => {
      const current = (prev[key] || []) as string[];
      const newValue = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return {
        ...prev,
        [key]: newValue.length > 0 ? newValue : undefined,
      };
    });
  };

  const handleApply = () => {
    onFiltersChange(localFilters);
    onApply?.();
    setOpen(false);
  };

  const handleClear = () => {
    const cleared: SearchFilters = {};
    setLocalFilters(cleared);
    onFiltersChange(cleared);
  };

  const activeFilterCount = Object.values(localFilters).filter(
    (v) => v !== undefined && (Array.isArray(v) ? v.length > 0 : true)
  ).length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Filter className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Advanced Filters</SheetTitle>
        </SheetHeader>

        <div className="px-6 py-4 space-y-6">
          {/* Section 1: Status */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Status</h3>
            <div className="space-y-2">
              {["HOT", "WARM", "FOLLOW-UP", "COLD", "NOT INTERESTED"].map((status) => (
                <label key={status} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(localFilters.status || []).includes(status)}
                    onChange={() => toggleArrayFilter("status", status)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">{status}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Section 2: Lead Score Range */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Lead Score</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="Min"
                  value={localFilters.lead_score_min || ""}
                  onChange={(e) =>
                    updateFilter("lead_score_min", e.target.value ? parseInt(e.target.value) : undefined)
                  }
                  className="w-24"
                />
                <span className="text-sm text-gray-500">to</span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="Max"
                  value={localFilters.lead_score_max || ""}
                  onChange={(e) =>
                    updateFilter("lead_score_max", e.target.value ? parseInt(e.target.value) : undefined)
                  }
                  className="w-24"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    updateFilter("lead_score_min", 70);
                    updateFilter("lead_score_max", 100);
                  }}
                >
                  70+ (HOT)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    updateFilter("lead_score_min", 30);
                    updateFilter("lead_score_max", 69);
                  }}
                >
                  30-69 (WARM)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    updateFilter("lead_score_min", 0);
                    updateFilter("lead_score_max", 29);
                  }}
                >
                  0-29 (COLD)
                </Button>
              </div>
            </div>
          </div>

          {/* Section 3: Tags */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Tags</h3>
            <div className="max-h-48 overflow-y-auto space-y-2">
              {loading ? (
                <p className="text-sm text-gray-500">Loading tags...</p>
              ) : availableTags.length === 0 ? (
                <p className="text-sm text-gray-500">No tags available</p>
              ) : (
                availableTags.map((tag) => (
                  <label key={tag} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(localFilters.tags || []).includes(tag)}
                      onChange={() => toggleArrayFilter("tags", tag)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">{tag}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Section 4: Neighborhood / City */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Location</h3>
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-medium text-gray-600 mb-2">Cities</h4>
                <div className="max-h-32 overflow-y-auto space-y-2">
                  {availableCities.map((city) => (
                    <label key={city} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(localFilters.cities || []).includes(city)}
                        onChange={() => toggleArrayFilter("cities", city)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">{city}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-600 mb-2">Neighborhoods</h4>
                <div className="max-h-32 overflow-y-auto space-y-2">
                  {availableNeighborhoods.map((neighborhood) => (
                    <label key={neighborhood} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(localFilters.neighborhoods || []).includes(neighborhood)}
                        onChange={() => toggleArrayFilter("neighborhoods", neighborhood)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">{neighborhood}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 5: Lists */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Lists</h3>
            <div className="max-h-32 overflow-y-auto space-y-2">
              {availableLists.map((list) => (
                <label key={list.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(localFilters.list_ids || []).includes(list.id)}
                    onChange={() => toggleArrayFilter("list_ids", list.id)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">{list.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Section 6: Storm Exposure */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Storm Exposure</h3>
            <div className="space-y-2">
              {["hail", "wind", "heavy_rain", "freeze"].map((exposure) => (
                <label key={exposure} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(localFilters.storm_exposure || []).includes(exposure)}
                    onChange={() => toggleArrayFilter("storm_exposure", exposure)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm capitalize">{exposure.replace("_", " ")}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Section 7: Email Activity */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Email Activity</h3>
            <div className="space-y-2">
              {[
                { value: "opened", label: "Opened" },
                { value: "not_opened", label: "Not Opened" },
                { value: "hard_bounced", label: "Hard Bounced" },
                { value: "soft_bounced", label: "Soft Bounced" },
                { value: "unsubscribed", label: "Unsubscribed" },
                { value: "complaint", label: "Complaint" },
              ].map((option) => (
                <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="email_status"
                    checked={localFilters.email_status === option.value}
                    onChange={() => updateFilter("email_status", option.value)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Section 8: Task Status */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Task Status</h3>
            <div className="space-y-2">
              {[
                { value: "has_tasks", label: "Has Tasks" },
                { value: "overdue_tasks", label: "Overdue Tasks" },
                { value: "completed_tasks", label: "Completed Tasks" },
                { value: "no_tasks", label: "No Tasks" },
              ].map((option) => (
                <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="task_status"
                    checked={localFilters.task_status === option.value}
                    onChange={() => updateFilter("task_status", option.value)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t flex gap-2">
          <Button onClick={handleClear} variant="outline" className="flex-1">
            Clear All
          </Button>
          <Button onClick={handleApply} className="flex-1">
            Apply Filters
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}





















































