import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { fetchRoofingJobsWithHealth } from "./_lib/fetchRoofingJobs";
import { RoofingJobsPipeline } from "./components/RoofingJobsPipeline";

export default async function RoofingJobsPage() {
  const supabase = await getServerSupabase();
  const orgId = await getCurrentOrgId();

  if (!orgId) {
    return (
      <div className="p-4 text-sm text-red-400">
        Could not determine organization. Please sign in again.
      </div>
    );
  }

  const initialJobs = await fetchRoofingJobsWithHealth(
    supabase,
    orgId,
    "latest_score"
  );

  return (
    <div className="p-4">
      <RoofingJobsPipeline orgId={orgId} initialJobs={initialJobs} />
    </div>
  );
}

