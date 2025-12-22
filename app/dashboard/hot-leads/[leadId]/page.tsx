// app/dashboard/hot-leads/[leadId]/page.tsx
// Block 97000 — Hot Lead Detail Page with One-Click Reply Templates

import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Clock, Mail, Phone, MapPin } from "lucide-react";
import { HotLeadReplyTemplates } from "./_components/HotLeadReplyTemplates";
import { MarkRepliedButton } from "./_components/MarkRepliedButton";

async function getHotLead(leadId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get lead with latest heat event
  const { data: lead, error } = await supabase
    .from("leads")
    .select(`
      id,
      email,
      first_name,
      last_name,
      phone,
      heat_score,
      updated_at,
      lead_heat_events!inner (
        id,
        message_id,
        intent,
        confidence,
        message_text,
        created_at
      )
    `)
    .eq("id", leadId)
    .eq("heat_score", "hot")
    .order("lead_heat_events(created_at)", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !lead) {
    return null;
  }

  // Get the latest heat event
  const latestEvent = Array.isArray(lead.lead_heat_events)
    ? lead.lead_heat_events[0]
    : lead.lead_heat_events;

  return {
    ...lead,
    latest_event: latestEvent,
  };
}

export default async function HotLeadDetailPage({
  params,
}: {
  params: { leadId: string };
}) {
  const lead = await getHotLead(params.leadId);

  if (!lead) {
    notFound();
  }

  const name = lead.first_name || lead.last_name
    ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
    : lead.email.split("@")[0];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            🔥 Hot Lead: {name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Respond within 60 seconds — this is how roofers win jobs.
          </p>
        </div>
        <MarkRepliedButton leadId={lead.id} messageId={lead.latest_event?.message_id} />
      </div>

      {/* Lead Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Lead Details</CardTitle>
          <CardDescription>Contact information and lead status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm font-medium">{lead.email}</p>
              </div>
            </div>
            {lead.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="text-sm font-medium">{lead.phone}</p>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Last Updated</p>
              <p className="text-sm font-medium">
                {new Date(lead.updated_at).toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Original Reply Card */}
      {lead.latest_event && (
        <Card>
          <CardHeader>
            <CardTitle>Original Reply</CardTitle>
            <CardDescription>
              Confidence: {Math.round((lead.latest_event.confidence || 0) * 100)}%
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm whitespace-pre-wrap">
                {lead.latest_event.message_text || "No message text available"}
              </p>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Received: {new Date(lead.latest_event.created_at).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      )}

      {/* One-Click Reply Templates */}
      <HotLeadReplyTemplates leadId={lead.id} leadEmail={lead.email} leadName={name} />
    </div>
  );
}


























