import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentTeamId } from "@/lib/team-helpers";
import { DispatchBoard } from "./components/DispatchBoard";

export default async function DispatchPage() {
  const supabase = await getServerSupabase();
  const teamId = await getCurrentTeamId();

  if (!teamId) {
    return (
      <div className="p-4 text-sm text-red-400">
        Could not determine team. Please sign in again.
      </div>
    );
  }

  // Fetch today's dispatch assignments
  const { data: todaysDispatch, error } = await supabase.rpc('get_todays_dispatch', {
    p_team_id: teamId,
    p_date: new Date().toISOString().split('T')[0]
  });

  // Fetch all crews for filter
  const { data: crews } = await supabase
    .from('crews')
    .select('id, name')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .order('name');

  return (
    <DispatchBoard
      teamId={teamId}
      initialDispatch={todaysDispatch || []}
      crews={crews || []}
    />
  );
}



























