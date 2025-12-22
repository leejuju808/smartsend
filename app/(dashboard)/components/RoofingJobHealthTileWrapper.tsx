import { getServerSupabase } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { fetchRoofingJobHealthSnapshot } from "../_lib/fetchRoofingJobHealthSnapshot";
import { RoofingJobHealthTileContainer } from "./RoofingJobHealthTileContainer";

export async function RoofingJobHealthTileWrapper() {
  const supabase = await getServerSupabase();
  const orgId = await getCurrentOrgId();

  let snapshot = null;

  if (orgId) {
    snapshot = await fetchRoofingJobHealthSnapshot(supabase, orgId);
  }

  if (!orgId) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 md:p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Roofing Job Health
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          No organization found. Please select an organization to view health scores.
        </p>
      </div>
    );
  }

  return (
    <RoofingJobHealthTileContainer orgId={orgId} initialSnapshot={snapshot} />
  );
}

