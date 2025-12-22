import StormDashboardClient from "./ui/StormDashboardClient";
import { createClient } from '@/lib/supabase/server';

export const dynamic = "force-dynamic";

export default async function StormDashboardPage({
  params
}: {
  params: { stormId: string };
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <div>Unauthorized</div>;
  }

  // Get user's team
  const { data: teamMember } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .single();

  if (!teamMember) {
    return <div>No team found</div>;
  }

  // Fetch initial storm data
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const dashboardRes = await fetch(
    `${baseUrl}/api/storm/${params.stormId}/dashboard?teamId=${teamMember.team_id}`,
    { cache: 'no-store' }
  );
  const dashboardData = dashboardRes.ok ? await dashboardRes.json() : null;

  // Fetch storm details
  const { data: storm } = await supabase
    .from('storm_events')
    .select('*')
    .eq('id', params.stormId)
    .eq('team_id', teamMember.team_id)
    .single();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {storm?.storm_type ? formatStormType(storm.storm_type) : 'Storm'} Response
          </h1>
          <p className="text-gray-400 mt-1">
            Detected {storm?.detected_at ? new Date(storm.detected_at).toLocaleString() : 'Unknown'}
          </p>
        </div>
        <div className="flex gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            storm?.severity === 'extreme' ? 'bg-red-500/20 text-red-400' :
            storm?.severity === 'severe' ? 'bg-orange-500/20 text-orange-400' :
            storm?.severity === 'moderate' ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-blue-500/20 text-blue-400'
          }`}>
            {storm?.severity?.toUpperCase() || 'UNKNOWN'}
          </span>
        </div>
      </div>

      {/* @ts-expect-error Server/Client boundary */}
      <StormDashboardClient
        stormId={params.stormId}
        teamId={teamMember.team_id}
        initialData={dashboardData}
        storm={storm}
      />
    </div>
  );
}

function formatStormType(type: string): string {
  const types: Record<string, string> = {
    hail: 'Hailstorm',
    wind: 'Windstorm',
    tornado: 'Tornado',
    heavy_rain: 'Heavy Rain',
    snow: 'Snowstorm',
    ice: 'Ice Storm'
  };
  return types[type] || type;
}






















