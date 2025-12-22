import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentTeamId } from "@/lib/team-helpers";
import { JobDetailView } from "./components/JobDetailView";

export default async function ProductionJobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const supabase = await getServerSupabase();
  const teamId = await getCurrentTeamId();

  if (!teamId) {
    return (
      <div className="p-4 text-sm text-red-400">
        Could not determine team. Please sign in again.
      </div>
    );
  }

  // Fetch job with lead details
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(`
      *,
      leads (
        id,
        first_name,
        last_name,
        email,
        phone
      )
    `)
    .eq("id", jobId)
    .eq("team_id", teamId)
    .single();

  if (jobError || !job) {
    return (
      <div className="p-4 text-sm text-red-400">
        Job not found or you don't have access to it.
      </div>
    );
  }

  // Fetch related data
  const [stageEvents, materials, schedule, photos, tasks] = await Promise.all([
    supabase
      .from("job_stage_events")
      .select("*")
      .eq("job_id", jobId)
      .order("changed_at", { ascending: false }),
    supabase
      .from("job_materials")
      .select("*")
      .eq("job_id", jobId)
      .order("ordered_at", { ascending: false }),
    supabase
      .from("job_schedule")
      .select("*")
      .eq("job_id", jobId)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("job_photos")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false }),
    supabase
      .from("job_tasks")
      .select("*")
      .eq("job_id", jobId)
      .order("due_at", { ascending: true }),
  ]);

  return (
    <JobDetailView
      job={job}
      lead={job.leads}
      stageEvents={stageEvents.data || []}
      materials={materials.data || []}
      schedule={schedule.data}
      photos={photos.data || []}
      tasks={tasks.data || []}
    />
  );
}


































