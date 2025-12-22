"use client";

import { useEffect, useState } from "react";
import { EmailThreadPanel } from "@/components/lead/EmailThreadPanel";
import { TasksPanel } from "@/components/lead/TasksPanel";
import { ActivityPanel } from "@/components/lead/ActivityPanel";

export default function LeadProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [leadId, setLeadId] = useState<string | null>(null);

  useEffect(() => {
    async function loadParams() {
      const resolvedParams = await params;
      setLeadId(resolvedParams.id);
    }
    loadParams();
  }, [params]);

  useEffect(() => {
    if (!leadId) return;

    fetch(`/api/leads/${leadId}`)
      .then((r) => r.json())
      .then(setData)
      .catch((err) => {
        console.error("Error fetching lead data:", err);
      })
      .finally(() => setLoading(false));
  }, [leadId]);

  if (loading || !data) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-24 bg-gray-200 rounded-xl"></div>
          <div className="h-64 bg-gray-200 rounded-xl"></div>
          <div className="h-48 bg-gray-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  const { lead, thread, emails, tasks, value, history } = data;

  if (!lead) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-800">Lead not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <div className="bg-white rounded-xl p-4 shadow-sm border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">
              {lead.first_name || "Homeowner"}
            </h1>
            <p className="text-sm text-gray-600">{lead.email}</p>
            <p className="text-sm text-gray-600">{lead.city || ""}</p>
          </div>

          <div className="text-right">
            <div className="font-semibold text-lg">
              ${value?.base_amount?.toLocaleString() ?? "0"}
            </div>
            <div className="text-sm text-gray-600">
              Health {Math.round(lead.job_health_score || 0)}/100
            </div>
            <div className="text-xs text-gray-500">
              {lead.pipeline_stage?.replace("_", " ") || "new"}
            </div>
          </div>
        </div>
      </div>

      {/* EMAIL THREAD */}
      <EmailThreadPanel emails={emails || []} thread={thread} />

      {/* TASKS */}
      <TasksPanel tasks={tasks || []} leadId={lead.id} />

      {/* TIMELINE / ACTIVITY */}
      <ActivityPanel history={history || []} />
    </div>
  );
}














































