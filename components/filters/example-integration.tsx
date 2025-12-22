/**
 * Example integration of Saved Filters into a Leads page
 * This shows the complete pattern for integrating filters
 */

"use client";

import { useState, useEffect } from "react";
import { FilterBuilder, FilterState } from "./filter-builder";
import { SaveFilterModal } from "./save-filter-modal";
import { SavedFilterSelector } from "./saved-filter-selector";
import { Button } from "@/components/ui/button";
import { getCurrentWorkspaceId } from "@/src/lib/workspace";

export function LeadsPageWithFilters() {
  const [filter, setFilter] = useState<FilterState>({});
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getCurrentWorkspaceId().then(setWorkspaceId);
  }, []);

  // Load leads when filter changes
  useEffect(() => {
    loadLeads();
  }, [filter, workspaceId]);

  async function loadLeads() {
    if (!workspaceId) return;

    setLoading(true);
    try {
      // Serialize filter to pass in query params
      const filterParam = Object.keys(filter).length > 0 
        ? encodeURIComponent(JSON.stringify(filter))
        : "";

      const url = `/api/leads${filterParam ? `?filter=${filterParam}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      setLeads(data.leads || []);
    } catch (error) {
      console.error("Failed to load leads:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">Leads</h1>
        
        {/* Filter Controls */}
        <div className="flex items-center gap-2 mb-4">
          <SavedFilterSelector
            context="leads"
            setFilter={setFilter}
            onClear={() => setFilter({})}
          />
          <Button 
            variant="outline" 
            onClick={() => setShowSaveModal(true)}
            disabled={Object.keys(filter).length === 0}
          >
            Save Filter
          </Button>
        </div>

        {/* Filter Builder */}
        <div className="border rounded-lg p-4 mb-4">
          <FilterBuilder
            filter={filter}
            setFilter={setFilter}
            workspaceId={workspaceId || undefined}
          />
        </div>
      </div>

      {/* Leads List */}
      {loading ? (
        <div>Loading...</div>
      ) : (
        <div>
          {leads.length === 0 ? (
            <div className="text-muted-foreground">No leads found</div>
          ) : (
            <div className="space-y-2">
              {leads.map((lead) => (
                <div key={lead.id} className="border rounded p-3">
                  <div className="font-medium">{lead.email}</div>
                  <div className="text-sm text-muted-foreground">
                    {lead.company}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Save Filter Modal */}
      <SaveFilterModal
        open={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        filter={filter}
        context="leads"
        workspaceId={workspaceId || undefined}
        onSaved={() => {
          // Optionally refresh the saved filters list
          window.location.reload();
        }}
      />
    </div>
  );
}

