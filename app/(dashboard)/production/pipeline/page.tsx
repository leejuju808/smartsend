import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentTeamId } from "@/lib/team-helpers";
import { JobPipelineKanban } from "./components/JobPipelineKanban";

export default async function ProductionPipelinePage() {
  const supabase = await getServerSupabase();
  const teamId = await getCurrentTeamId();

  if (!teamId) {
    return (
      <div className="p-4 text-sm text-red-400">
        Could not determine team. Please sign in again.
      </div>
    );
  }

  // Fetch initial jobs for all stages
  const stages = ['estimate', 'approved', 'insurance', 'materials', 'scheduled', 'in_progress', 'completed'];
  
  const initialJobs: Record<string, any[]> = {};
  
  for (const stage of stages) {
    const { data, error } = await supabase.rpc('get_jobs_by_stage', {
      p_team_id: teamId,
      p_stage: stage
    });
    
    if (!error && data) {
      initialJobs[stage] = data;
    } else {
      initialJobs[stage] = [];
    }
  }

  // Fetch dashboard metrics
  const { data: metrics } = await supabase.rpc('get_production_dashboard', {
    p_team_id: teamId
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Job Pipeline</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track every job from estimate → signed → production → completion
        </p>
      </div>

      <JobPipelineKanban 
        teamId={teamId} 
        initialJobs={initialJobs}
        initialMetrics={metrics || null}
      />
    </div>
  );
}


































