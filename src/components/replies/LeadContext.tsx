"use client";

import { useLeadContext } from "@/hooks/useLeadContext";
import { useLeadActivity } from "@/hooks/useLeadActivity";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

const tagOptions = ["Hot Lead", "Follow-up", "Unqualified"];

export default function LeadContext({ leadEmail }: { leadEmail?: string }) {
  const { lead, loading, refresh } = useLeadContext(leadEmail);
  const { activity, loading: activityLoading, refresh: refreshActivity } = useLeadActivity(lead?.id);
  const supabase = createClientComponentClient();
  const [notes, setNotes] = useState(lead?.notes || "");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [campaign, setCampaign] = useState<{ name: string; status?: string } | null>(null);

  useEffect(() => {
    if (lead?.notes !== undefined) {
      setNotes(lead.notes || "");
    }
  }, [lead]);

  useEffect(() => {
    if (!lead?.campaign_id) {
      setCampaign(null);
      return;
    }

    const loadCampaign = async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("name, status")
        .eq("id", lead.campaign_id)
        .maybeSingle();
      if (data) setCampaign(data);
    };

    loadCampaign();
  }, [lead?.campaign_id, supabase]);

  const saveNotes = async () => {
    if (!lead?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("leads")
        .update({ notes })
        .eq("id", lead.id);
      if (error) {
        console.error("Error saving notes:", error);
      }
    } catch (err) {
      console.error("Error saving notes:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleTagClick = async (tag: string) => {
    if (!lead?.id) return;
    
    const currentTags = lead.tags || [];
    const newTags = currentTags.includes(tag)
      ? currentTags.filter((t) => t !== tag)
      : [...new Set([...currentTags, tag])];

    try {
      const { error } = await supabase
        .from("leads")
        .update({ tags: newTags })
        .eq("id", lead.id);
      if (error) {
        console.error("Error updating tags:", error);
      } else {
        // Log timeline event if tag was added (not removed)
        if (newTags.includes(tag) && !currentTags.includes(tag)) {
          await supabase.from("lead_timeline_events").insert({
            lead_id: lead.id,
            event_type: "tag_added",
            metadata: { tag }
          }).catch((err) => {
            console.error("Failed to log timeline event:", err);
          });
        }
        // Refresh lead data
        refresh();
      }
    } catch (err) {
      console.error("Error updating tags:", err);
    }
  };

  if (loading) {
    return (
      <aside className="w-80 border-l h-full flex flex-col bg-muted/10">
        <div className="p-4 text-sm text-muted-foreground">Loading context…</div>
      </aside>
    );
  }

  if (!lead) {
    return (
      <aside className="w-80 border-l h-full flex flex-col bg-muted/10">
        <div className="p-4 text-sm text-muted-foreground">No lead data found</div>
      </aside>
    );
  }

  const leadName =
    lead.name ||
    [lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
    "Unknown Lead";

  return (
    <aside className="w-80 border-l h-full flex flex-col bg-muted/10 overflow-y-auto">
      {/* Lead Info Section */}
      <div className="p-4 space-y-1 border-b bg-background">
        <h2 className="text-lg font-semibold">{leadName}</h2>
        <p className="text-sm text-muted-foreground">{lead.email}</p>
        {lead.company && (
          <p className="text-sm text-foreground">{lead.company}</p>
        )}
        {lead.phone && (
          <p className="text-sm text-foreground">{lead.phone}</p>
        )}
      </div>

      {/* Campaign Info Section */}
      {campaign && (
        <div className="p-4 border-b bg-background">
          <h3 className="text-sm font-semibold mb-2">Campaign</h3>
          <p className="text-sm">{campaign.name}</p>
          {campaign.status && (
            <p className="text-xs text-muted-foreground mt-1">
              Status: {campaign.status}
            </p>
          )}
        </div>
      )}

      {/* Quick Tags Section */}
      <div className="p-4 border-b bg-background">
        <h3 className="text-sm font-semibold mb-2">Quick Tags</h3>
        <div className="flex flex-wrap gap-2">
          {tagOptions.map((tag) => {
            const isActive = (lead.tags || []).includes(tag);
            return (
              <button
                key={tag}
                onClick={() => handleTagClick(tag)}
                className={`px-2 py-1 text-xs border rounded-xl transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
        {(lead.tags || []).length > 0 && (
          <div className="mt-3">
            <h4 className="text-xs font-medium mb-2 text-muted-foreground">Current Tags</h4>
            <div className="flex flex-wrap gap-2">
              {(lead.tags || []).map((t: string, i: number) => (
                <span
                  key={i}
                  className="px-2 py-1 text-xs border rounded-xl bg-background"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Notes Section */}
      <div className="p-4 border-b bg-background">
        <h3 className="text-sm font-semibold mb-2">Notes</h3>
        <textarea
          className="w-full h-32 resize-none border rounded-xl p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes about this lead..."
        />
        <button
          onClick={saveNotes}
          disabled={saving}
          className="mt-2 text-sm px-3 py-1 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Activity Feed Section */}
      <div className="flex-1 border-t p-4 overflow-y-auto bg-background">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Recent Activity</h3>
          <button
            onClick={async () => {
              if (!lead?.id) return;
              setGenerating(true);
              try {
                const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                if (!supabaseUrl) {
                  alert("Missing Supabase URL configuration");
                  return;
                }
                
                // Get the session token for authenticated request
                const { data: { session } } = await supabase.auth.getSession();
                const token = session?.access_token || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
                
                const response = await fetch(
                  `${supabaseUrl}/functions/v1/ai-lead-summary`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ lead_id: lead.id }),
                  }
                );
                if (response.ok) {
                  const result = await response.json();
                  console.log("AI Summary generated:", result);
                  // Refresh activity feed
                  await refreshActivity();
                } else {
                  const error = await response.json();
                  alert(`Failed to generate summary: ${error.error || "Unknown error"}`);
                }
              } catch (err: any) {
                console.error("Error generating summary:", err);
                alert(`Error: ${err.message || "Failed to generate summary"}`);
              } finally {
                setGenerating(false);
              }
            }}
            disabled={generating || !lead?.id}
            className="text-sm bg-primary text-primary-foreground px-3 py-1 rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? "Generating…" : "🔮 Generate AI Summary"}
          </button>
        </div>
        {activityLoading ? (
          <div className="text-xs text-muted-foreground">Loading activity...</div>
        ) : activity.length === 0 ? (
          <div className="text-xs text-muted-foreground">No activity recorded yet.</div>
        ) : (
          <div className="space-y-2">
            {activity.map((a) => (
              <div key={a.id} className="text-xs mb-2 pb-2 border-b last:border-0">
                <div className="flex items-start gap-2">
                  <span className="font-medium capitalize">{a.type}</span>
                  {a.sentiment && (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] ${
                        a.sentiment === "positive"
                          ? "bg-green-100 text-green-800"
                          : a.sentiment === "negative"
                          ? "bg-red-100 text-red-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {a.sentiment}
                    </span>
                  )}
                </div>
                {(a.summary || a.meta?.detail) && (
                  <div className="mt-1 text-muted-foreground">
                    {a.summary || a.meta?.detail || ""}
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground mt-1">
                  {new Date(a.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

