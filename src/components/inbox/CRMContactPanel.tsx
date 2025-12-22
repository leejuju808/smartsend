"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Calendar, Briefcase, TrendingUp } from "lucide-react";

interface CRMContactPanelProps {
  contactId: string | null;
  threadId?: string | null;
}

interface CRMData {
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone: string | null;
    address: string | null;
    status: string | null;
    insurance_mentioned: boolean;
    roof_type_mentioned: boolean;
    pain_points: string[] | null;
  } | null;
  lastJob: {
    id: string;
    job_type: string | null;
    estimated_value: number | null;
    status: string;
    expected_close_date: string | null;
  } | null;
  nextFollowUp: {
    id: string;
    title: string;
    due_date: string | null;
  } | null;
  totalPipelineValue: number;
}

/**
 * CRM Contact Panel Component
 * Block 19780 — Part 5: CRM-Ready UI Hooks
 * 
 * Displays:
 * - Contact status chip
 * - Last job booked
 * - Next follow-up task
 * - Total pipeline value for this contact
 * - "View full profile" link (future CRM route)
 */
export function CRMContactPanel({ contactId, threadId }: CRMContactPanelProps) {
  const [data, setData] = useState<CRMData | null>(null);
  const [loading, setLoading] = useState(true);
  const sb = supabaseBrowser();

  useEffect(() => {
    if (!contactId) {
      setData(null);
      setLoading(false);
      return;
    }

    loadCRMData();
  }, [contactId, threadId]);

  async function loadCRMData() {
    if (!contactId) return;

    try {
      setLoading(true);

      // Load contact with CRM fields
      const { data: contact } = await sb
        .from("contacts")
        .select("id, first_name, last_name, email, phone, address, status, insurance_mentioned, roof_type_mentioned, pain_points")
        .eq("id", contactId)
        .single();

      // Load last job
      const { data: lastJob } = await sb
        .from("crm_jobs")
        .select("id, job_type, estimated_value, status, expected_close_date")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Load next follow-up task
      const { data: nextFollowUp } = await sb
        .from("tasks")
        .select("id, title, due_date")
        .eq("contact_id", contactId)
        .in("status", ["todo", "in_progress"])
        .order("due_date", { ascending: true })
        .limit(1)
        .maybeSingle();

      // Calculate total pipeline value
      const { data: jobs } = await sb
        .from("crm_jobs")
        .select("estimated_value")
        .eq("contact_id", contactId)
        .in("status", ["booked", "pending"]);

      const totalPipelineValue = jobs?.reduce((sum, job) => sum + (job.estimated_value || 0), 0) || 0;

      setData({
        contact,
        lastJob: lastJob || null,
        nextFollowUp: nextFollowUp || null,
        totalPipelineValue,
      });
    } catch (error) {
      console.error("Error loading CRM data:", error);
    } finally {
      setLoading(false);
    }
  }

  if (!contactId) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-sm">CRM Info</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Select a thread to view CRM data</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-sm">CRM Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data?.contact) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-sm">CRM Info</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Contact not found</p>
        </CardContent>
      </Card>
    );
  }

  const { contact, lastJob, nextFollowUp, totalPipelineValue } = data;

  const getStatusColor = (status: string | null) => {
    const colors: Record<string, string> = {
      lead: "bg-blue-100 text-blue-800",
      active: "bg-green-100 text-green-800",
      booked: "bg-purple-100 text-purple-800",
      "in-progress": "bg-yellow-100 text-yellow-800",
      won: "bg-emerald-100 text-emerald-800",
      lost: "bg-gray-100 text-gray-800",
      "follow-up": "bg-orange-100 text-orange-800",
    };
    return colors[status || "lead"] || colors.lead;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-sm">CRM Info</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Contact Status */}
        <div>
          <div className="text-xs text-muted-foreground mb-1">Status</div>
          <Badge className={getStatusColor(contact.status)}>
            {contact.status || "lead"}
          </Badge>
        </div>

        {/* Last Job Booked */}
        {lastJob && (
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Briefcase className="w-3 h-3" />
              Last Job
            </div>
            <div className="text-sm font-medium">
              {lastJob.job_type?.replace(/_/g, " ") || "Unknown type"}
            </div>
            {lastJob.estimated_value && (
              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <DollarSign className="w-3 h-3" />
                ${lastJob.estimated_value.toLocaleString()}
              </div>
            )}
            {lastJob.expected_close_date && (
              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Calendar className="w-3 h-3" />
                {new Date(lastJob.expected_close_date).toLocaleDateString()}
              </div>
            )}
          </div>
        )}

        {/* Next Follow-Up Task */}
        {nextFollowUp && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Next Follow-Up</div>
            <div className="text-sm font-medium">{nextFollowUp.title}</div>
            {nextFollowUp.due_date && (
              <div className="text-xs text-muted-foreground mt-1">
                Due: {new Date(nextFollowUp.due_date).toLocaleDateString()}
              </div>
            )}
          </div>
        )}

        {/* Total Pipeline Value */}
        {totalPipelineValue > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Pipeline Value
            </div>
            <div className="text-lg font-semibold text-green-600">
              ${totalPipelineValue.toLocaleString()}
            </div>
          </div>
        )}

        {/* Contact Enrichment Indicators */}
        {(contact.insurance_mentioned || contact.roof_type_mentioned || contact.pain_points?.length) && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Mentioned</div>
            <div className="flex flex-wrap gap-1">
              {contact.insurance_mentioned && (
                <Badge variant="outline" className="text-xs">Insurance</Badge>
              )}
              {contact.roof_type_mentioned && (
                <Badge variant="outline" className="text-xs">Roof Type</Badge>
              )}
              {contact.pain_points?.map((point, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {point.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* View Full Profile Link */}
        <div className="pt-2 border-t">
          <a
            href={`/contacts/${contact.id}`}
            className="text-xs text-blue-600 hover:underline"
          >
            View full profile →
          </a>
        </div>
      </CardContent>
    </Card>
  );
}



















































