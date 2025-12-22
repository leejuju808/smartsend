import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";
import { PipelineKanbanBoard } from "./components/PipelineKanbanBoard";

export default async function PipelinePage() {
  const supabase = await getServerSupabase();
  const companyId = await getCurrentCompanyId();

  if (!companyId) {
    return (
      <div className="p-4 text-sm text-red-400">
        Could not determine company. Please sign in again or select a company.
      </div>
    );
  }

  // Fetch stages for the company
  const { data: stages } = await supabase.rpc('get_pipeline_stages_with_counts', {
    p_company_id: companyId
  });

  // Fetch jobs grouped by stage
  const initialJobs: Record<string, any[]> = {};
  
  if (stages) {
    for (const stage of stages) {
      const { data: jobs } = await supabase.rpc('get_jobs_by_stage_id', {
        p_company_id: companyId,
        p_stage_id: stage.id
      });
      initialJobs[stage.id] = jobs || [];
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Job Pipeline</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage all your jobs from lead to paid. Drag and drop to move jobs between stages.
        </p>
      </div>

      <PipelineKanbanBoard 
        companyId={companyId} 
        initialStages={stages || []}
        initialJobs={initialJobs}
      />
    </div>
  );
}
