"use client";

import useSWR from "swr";
import { TagPill } from "@/components/tags/tag-pill";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { CommentsPanel } from "@/components/comments/comments-panel";
import { AssignDropdown } from "@/components/team/assign-dropdown";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function LeadSidebar({ leadId }: { leadId: string }) {
  const { data, error, mutate } = useSWR(`/api/leads/${leadId}/sidebar`, fetcher);

  if (error) {
    return (
      <div className="w-80 border-l p-4 overflow-y-scroll h-screen bg-background">
        <div className="text-sm text-destructive">Error loading lead data</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="w-80 border-l p-4 overflow-y-scroll h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { lead, tags, notes, timeline, campaigns, metrics, aiData, stages } = data;

  async function addNote() {
    const textarea = document.getElementById("sidebarNote") as HTMLTextAreaElement;
    if (!textarea.value.trim()) return;

    try {
      await fetch(`/api/leads/${leadId}/notes/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: textarea.value }),
      });

      textarea.value = "";
      mutate();
    } catch (err) {
      console.error("Failed to add note:", err);
    }
  }

  const leadName =
    lead.name ||
    [lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
    lead.email ||
    "Unknown Lead";

  return (
    <div className="w-80 border-l p-4 overflow-y-scroll h-screen bg-background">
      <h3 className="font-semibold text-lg mb-3">Lead</h3>

      {/* Lead Identity */}
      <div className="space-y-1 mb-4">
        <p className="font-bold">{leadName}</p>
        <p className="text-sm opacity-70">{lead.email}</p>
        
        {/* Assign Lead */}
        <div className="mt-3">
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">
            Assigned To
          </label>
          <AssignDropdown
            type="lead"
            id={leadId}
            currentOwnerId={lead.owner_id}
            onAssign={() => mutate()}
          />
        </div>
        
        {/* Stage Selector */}
        {stages && stages.length > 0 && (
          <div className="mt-3">
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">
              Stage
            </label>
            <Select
              value={lead.stage_id || ""}
              onValueChange={async (v) => {
                try {
                  await fetch(`/api/leads/${leadId}/stage`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ stage_id: v || null }),
                  });
                  mutate();
                } catch (err) {
                  console.error("Failed to update stage:", err);
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No stage</SelectItem>
                {stages.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {lead.email_valid === false && (
          <p className="text-red-600 text-sm font-semibold">
            Email Bounced ({lead.email_status || 'invalid'})
          </p>
        )}
        {lead.company && <p className="text-sm">{lead.company}</p>}
        {lead.title && <p className="text-sm opacity-70">{lead.title}</p>}
        {lead.location && <p className="text-sm opacity-70">{lead.location}</p>}
        {lead.website && (
          <a
            href={lead.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            {lead.website}
          </a>
        )}
        {aiData?.phone && (
          <p className="text-sm opacity-70">Phone: {aiData.phone}</p>
        )}
        {aiData?.linkedin && (
          <a
            href={aiData.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            LinkedIn: {aiData.linkedin}
          </a>
        )}
        {aiData?.website && (
          <a
            href={aiData.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            Website: {aiData.website}
          </a>
        )}

        {/* Deep Enrich Button */}
        <div className="mt-3">
          <Button
            onClick={async () => {
              try {
                const res = await fetch("/api/leads/enrich/v2", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ lead_id: leadId }),
                });
                if (res.ok) {
                  mutate(); // Refresh data
                } else {
                  console.error("Deep enrich failed");
                }
              } catch (err) {
                console.error("Failed to deep enrich:", err);
              }
            }}
            variant="secondary"
            size="sm"
            className="w-full"
          >
            Deep Enrich (v2)
          </Button>
        </div>
      </div>

      {/* Company Profile (v2) */}
      {(lead.website || lead.company_description || lead.industry || lead.employee_count || lead.company_size || (lead.tech_stack && lead.tech_stack.length > 0)) && (
        <div className="mb-4 mt-4 p-3 rounded-lg border bg-muted/30">
          <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase">Company Profile (v2)</h4>
          <div className="space-y-1 text-sm">
            {lead.website && (
              <p>
                <b>Website:</b>{" "}
                <a
                  href={lead.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {lead.website}
                </a>
              </p>
            )}
            {lead.company_description && (
              <p>
                <b>Description:</b> {lead.company_description}
              </p>
            )}
            {lead.industry && (
              <p>
                <b>Industry:</b> {lead.industry}
              </p>
            )}
            {lead.employee_count !== null && lead.employee_count !== undefined && (
              <p>
                <b>Employees:</b> {lead.employee_count.toLocaleString()}
              </p>
            )}
            {lead.company_size && (
              <p>
                <b>Size:</b> {lead.company_size}
              </p>
            )}
            {lead.tech_stack && Array.isArray(lead.tech_stack) && lead.tech_stack.length > 0 && (
              <p>
                <b>Tech Stack:</b> {lead.tech_stack.join(", ")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Proposed Meeting Times */}
      {aiData?.meeting_times && Array.isArray(aiData.meeting_times) && aiData.meeting_times.length > 0 && (
        <div className="mb-4 mt-4">
          <h4 className="font-semibold mb-2 text-sm">Proposed Meeting Times</h4>
          <ul className="space-y-1 text-sm">
            {aiData.meeting_times.map((t: string, idx: number) => (
              <li key={idx} className="p-2 rounded bg-muted">
                {new Date(t).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AI Lead Score v3 (ML) */}
      {(lead.score_v3 !== null && lead.score_v3 !== undefined) && (
        <div className="mb-4 p-3 rounded-lg border bg-muted/30">
          <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase">AI Lead Score v3 (ML)</h4>
          <p className="text-4xl font-bold">{lead.score_v3}</p>
          {lead.probability_reply !== null && lead.probability_reply !== undefined && (
            <p className="text-sm opacity-60 mt-2">
              Reply Probability: {(lead.probability_reply * 100).toFixed(1)}%
            </p>
          )}
          {lead.probability_meeting !== null && lead.probability_meeting !== undefined && (
            <p className="text-sm opacity-60">
              Meeting Probability: {(lead.probability_meeting * 100).toFixed(1)}%
            </p>
          )}
        </div>
      )}

      {/* AI Lead Score v2 */}
      {(lead.score_v2 !== null && lead.score_v2 !== undefined) && (
        <div className="mb-4 p-3 rounded-lg border bg-muted/30">
          <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase">AI Lead Score (v2)</h4>
          <p className="text-3xl font-bold">{lead.score_v2}</p>
          {lead.scoring_v2?.reply_likelihood !== null && lead.scoring_v2?.reply_likelihood !== undefined && (
            <p className="text-xs opacity-70 mt-2">
              AI Confidence: {lead.scoring_v2.reply_likelihood}/10
            </p>
          )}
          {lead.scoring_v2 && (
            <div className="text-xs space-y-1 opacity-80 mt-3">
              <p><b>Industry Fit:</b> {lead.scoring_v2.industry_fit || 0}</p>
              <p><b>Company Fit:</b> {lead.scoring_v2.company_fit || 0}</p>
              <p><b>Engagement:</b> {lead.scoring_v2.engagement_score || 0}</p>
              <p><b>Intent:</b> {lead.scoring_v2.intent_score || 0}</p>
              <p><b>Website Intelligence:</b> {lead.scoring_v2.website_intelligence_score || 0}</p>
              <p><b>Personalization:</b> {lead.scoring_v2.personalization_score || 0}</p>
            </div>
          )}
        </div>
      )}

      {/* Lead Score */}
      {lead.score !== null && lead.score !== undefined && (
        <div className="mb-4 p-3 rounded-lg border bg-muted/30">
          <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase">Lead Score</h4>
          <div className="space-y-1">
            <p className="text-3xl font-bold">{lead.score}</p>
            <p className={`text-sm capitalize font-medium ${
              lead.score_bucket === 'hot' ? 'text-red-600' :
              lead.score_bucket === 'warm' ? 'text-orange-600' :
              lead.score_bucket === 'cool' ? 'text-blue-600' :
              'text-gray-600'
            }`}>
              {lead.score_bucket || 'cold'} lead
            </p>
          </div>
        </div>
      )}

      {/* Quick Metrics */}
      <div className="mb-4 p-3 rounded-lg border bg-muted/30">
        <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase">Quick Metrics</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Sent:</span>{" "}
            <span className="font-medium">{metrics?.emails_sent || 0}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Opens:</span>{" "}
            <span className="font-medium">{metrics?.opens || 0}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Clicks:</span>{" "}
            <span className="font-medium">{metrics?.clicks || 0}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Replies:</span>{" "}
            <span className="font-medium">{metrics?.replies || 0}</span>
          </div>
        </div>
      </div>

      {/* Enrichment */}
      <h3 className="font-semibold mt-6 mb-3">Enrichment</h3>
      {lead.enriched ? (
        <div className="space-y-1 text-sm mb-4">
          {lead.guessed_company && (
            <p>
              <b>Company:</b> {lead.guessed_company}
            </p>
          )}
          {lead.guessed_industry && (
            <p>
              <b>Industry:</b> {lead.guessed_industry}
            </p>
          )}
          {lead.guessed_title && (
            <p>
              <b>Title:</b> {lead.guessed_title}
            </p>
          )}
          {lead.guessed_linkedin && (
            <p>
              <b>LinkedIn:</b>{" "}
              <a
                href={lead.guessed_linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {lead.guessed_linkedin}
              </a>
            </p>
          )}
          {lead.guessed_location && (
            <p>
              <b>Location:</b> {lead.guessed_location}
            </p>
          )}
          {!lead.guessed_company &&
            !lead.guessed_industry &&
            !lead.guessed_title &&
            !lead.guessed_linkedin &&
            !lead.guessed_location && (
              <p className="text-sm text-muted-foreground">No enrichment data available</p>
            )}
        </div>
      ) : (
        <div className="mb-4">
          <EnrichButton lead={lead} onEnriched={() => mutate()} />
        </div>
      )}

      {/* Tags */}
      <h3 className="font-semibold mb-3">Tags</h3>
      <div className="flex flex-wrap gap-2 mb-4">
        {tags && tags.length > 0 ? (
          tags.map((t: { id: string; name: string }) => (
            <TagPill key={t.id} name={t.name} />
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No tags</p>
        )}
      </div>

      {/* Add Note */}
      <h3 className="font-semibold mb-3">Add Note</h3>
      <Textarea id="sidebarNote" placeholder="Write a note…" rows={3} className="mb-2" />
      <Button className="w-full" onClick={addNote} size="sm">
        Add Note
      </Button>

      {/* Recent Notes */}
      <h3 className="font-semibold mt-6 mb-3">Recent Notes</h3>
      <div className="space-y-3 mb-4">
        {notes && notes.length > 0 ? (
          notes.map((n: any) => (
            <div key={n.id} className="p-3 rounded border bg-muted">
              <p className="text-sm whitespace-pre-line">{n.body}</p>
              <span className="text-xs opacity-60">
                {new Date(n.created_at).toLocaleString()}
              </span>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No notes yet</p>
        )}
      </div>

      {/* Recent Activity */}
      <h3 className="font-semibold mt-6 mb-3">Recent Activity</h3>
      <div className="space-y-3 mb-4">
        {timeline && timeline.length > 0 ? (
          timeline.map((ev: any) => (
            <div key={ev.id} className="p-3 border rounded bg-card">
              <p className="font-semibold text-sm capitalize">
                {ev.event_type.replace(/_/g, " ")}
              </p>
              <p className="text-xs opacity-60">{new Date(ev.created_at).toLocaleString()}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No activity yet</p>
        )}
      </div>

      {/* Campaigns */}
      <h3 className="font-semibold mt-6 mb-3">Campaigns</h3>
      <div className="space-y-1">
        {campaigns && campaigns.length > 0 ? (
          campaigns.map((c: any) => (
            <div key={c.campaign_id} className="text-sm">
              <Badge variant="outline" className="text-xs">
                Campaign: {c.campaign_id.slice(0, 8)}… — {c.status || "Active"}
              </Badge>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Not in any campaigns</p>
        )}
      </div>

      {/* Comments */}
      <div className="mt-6">
        <CommentsPanel context="lead" id={leadId} />
      </div>
    </div>
  );
}

