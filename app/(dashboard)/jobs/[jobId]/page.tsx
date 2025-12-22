import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { fetchRoofingJobHealthTimeline } from "../_lib/fetchRoofingJobHealthTimeline";
import { RoofingJobHealthStoryline } from "./components/RoofingJobHealthStoryline";
import { RoofingAiReplyBox } from "./components/RoofingAiReplyBox";
import { FastEstimateLinkCard } from "./components/FastEstimateLinkCard";
import { HeatBar } from "../../components/HeatBar";
import { fetchRoofingHealthSettings } from "@/app/(dashboard)/settings/roofing-health/_lib/notificationSettings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JobDocumentsTab } from "./components/JobDocumentsTab";
import { DocumentVaultTab } from "./components/DocumentVaultTab";
import { SignableDocumentsTab } from "./components/SignableDocumentsTab";
import { JobMaterialsPanel } from "./components/JobMaterialsPanel";
import { JobPermitsPanel } from "./components/JobPermitsPanel";
import { JobInsurancePanel } from "./components/JobInsurancePanel";
import { JobFieldActivityPanel } from "./components/JobFieldActivityPanel";
import { ProfitSnapshot } from "./components/ProfitSnapshot";
import { ProfitEngineCard } from "./components/ProfitEngineCard";
import { JobForecastPanel } from "./components/JobForecastPanel";
import { JobPaymentsTab } from "./components/JobPaymentsTab";
import { MaterialsTab } from "./components/MaterialsTab";
import { MaterialsTabV2 } from "./components/MaterialsTabV2";
import { JobCollectionsCard } from "./components/JobCollectionsCard";
import { JobQATab } from "./components/JobQATab";
import { RoofMeasurementPanel } from "./components/RoofMeasurementPanel";
import { AIRoofMeasurementsPanel } from "./components/AIRoofMeasurementsPanel";
import { RoofMaterialEstimator } from "./components/RoofMaterialEstimator";
import { InsuranceClaimTab } from "./components/InsuranceClaimTab";
import { ChangeOrdersTab } from "./components/ChangeOrdersTab";
import { InsuranceSupplementsTab } from "./components/InsuranceSupplementsTab";
import Link from "next/link";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const supabase = await getServerSupabase();
  const orgId = await getCurrentOrgId();

  if (!orgId) {
    return (
      <div className="p-4 text-sm text-red-400">
        Could not determine organization. Please sign in again.
      </div>
    );
  }

  const { data, error } = await supabase
    .from("roofing_jobs_with_health")
    .select("*")
    .eq("org_id", orgId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (error || !data) {
    return (
      <div className="p-4 text-sm text-red-400">
        Could not load this roofing job.
      </div>
    );
  }

  const job = data;
  const timeline = await fetchRoofingJobHealthTimeline(supabase, orgId, jobId);
  const settings = await fetchRoofingHealthSettings(supabase, orgId);
  const isCompleted = (job.status || "").toLowerCase() === "completed";
  const awaiting = Number((job as any).cash_awaiting_payment_amount || 0);
  const days = (job as any).cash_days_until_expected as number | null | undefined;
  const isStalled = Boolean((job as any).cash_is_stalled);

  return (
    <div className="space-y-4 p-4">
      {/* Job header */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <h1 className="text-xl font-semibold text-zinc-50">
          {job.homeowner_name || "Unknown homeowner"}
        </h1>
        {job.homeowner_email && (
          <p className="text-sm text-zinc-400 mt-1">{job.homeowner_email}</p>
        )}
        {job.status && (
          <p className="text-xs text-zinc-500 mt-2">Status: {job.status}</p>
        )}
        {isCompleted && awaiting > 0 ? (
          <p className="text-sm text-zinc-200 mt-3">
            {isStalled
              ? "Completed work awaiting payment."
              : `Cash expected in ~${Math.max(0, Number(days ?? 0))} days.`}
          </p>
        ) : null}
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-11">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="measurements">Measurements</TabsTrigger>
          <TabsTrigger value="materials">Materials</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="signable">E-Sign Documents</TabsTrigger>
          <TabsTrigger value="insurance">Insurance Claim</TabsTrigger>
          <TabsTrigger value="change-orders">Change Orders</TabsTrigger>
          <TabsTrigger value="supplements">Supplements</TabsTrigger>
          <TabsTrigger value="qa">QA</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* left: existing health score + breakdown cards */}
            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Job Health Score
                </p>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-zinc-50">
                    {job.latest_score ?? 0}
                  </span>
                  <span className="text-xs text-zinc-500">/ 100</span>
                </div>
                <HeatBar score={job.latest_score ?? 0} />
                <p className="mt-2 text-xs text-zinc-400">
                  This score combines engagement, intent, follow-up, and response time so
                  you know how likely this homeowner is to book a roofing job with you.
                </p>
                {job.last_calculated_at && (
                  <p className="mt-2 text-[10px] text-zinc-500">
                    Last updated {new Date(job.last_calculated_at).toLocaleString()}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-300">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Score Breakdown
                </p>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Engagement</span>
                    <span className="font-semibold">
                      {job.engagement_score ?? 0} / 40
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Intent</span>
                    <span className="font-semibold">{job.intent_score ?? 0} / 30</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Follow-Up</span>
                    <span className="font-semibold">
                      {job.follow_up_score ?? 0} / 20
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Timeliness</span>
                    <span className="font-semibold">
                      {job.timeliness_score ?? 0} / 10
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-zinc-400">
                  Use this to decide your next move: high intent + good engagement =
                  call them now. Low engagement or slow replies = send another follow-up.
                </p>
              </div>

              <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-[11px] text-zinc-300">
                <p className="font-semibold text-zinc-50">
                  How to use this score
                </p>
                <p className="mt-1">
                  High score (especially from replies + fast opens) means this homeowner is
                  <span className="font-semibold"> ready to move forward.</span> 
                  {" "}Call or text them now to lock in the estimate.
                </p>
                <p className="mt-1">
                  Low score means the job is cooling off. Send another follow-up or move them 
                  down your priority list so you stay focused on money jobs.
                </p>
              </div>
            </div>

            {/* right: storyline + booking tools */}
            <div className="space-y-4">
              <JobCollectionsCard jobId={jobId} />
              <ProfitEngineCard jobId={jobId} />
              <ProfitSnapshot jobId={jobId} />
              <JobForecastPanel jobId={jobId} />
              <RoofingJobHealthStoryline events={timeline} />
              <JobFieldActivityPanel jobId={jobId} />
              <JobInsurancePanel jobId={jobId} />
              <JobPermitsPanel jobId={jobId} />
              <JobMaterialsPanel jobId={jobId} />
              <FastEstimateLinkCard fastEstimateUrl={settings.fast_estimate_url ?? null} />
              <RoofingAiReplyBox jobId={jobId} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="measurements" className="mt-4">
          <div className="space-y-4">
            <AIRoofMeasurementsPanel jobId={jobId} />
            <RoofMeasurementPanel jobId={jobId} />
            <RoofMaterialEstimator jobId={jobId} />
          </div>
        </TabsContent>

        <TabsContent value="materials" className="mt-4">
          <MaterialsTabV2 jobId={jobId} />
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <JobPaymentsTab
            jobId={jobId}
            orgId={job.org_id || orgId}
            homeownerName={job.homeowner_name}
            homeownerEmail={job.homeowner_email}
            jobValue={job.projected_job_value || job.job_value}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <DocumentVaultTab jobId={jobId} />
        </TabsContent>

        <TabsContent value="signable" className="mt-4">
          <SignableDocumentsTab jobId={jobId} />
        </TabsContent>

        <TabsContent value="insurance" className="mt-4">
          <InsuranceClaimTab jobId={jobId} />
        </TabsContent>

        <TabsContent value="change-orders" className="mt-4">
          <ChangeOrdersTab jobId={jobId} />
        </TabsContent>

        <TabsContent value="supplements" className="mt-4">
          <InsuranceSupplementsTab jobId={jobId} />
        </TabsContent>

        <TabsContent value="qa" className="mt-4">
          <JobQATab jobId={jobId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

