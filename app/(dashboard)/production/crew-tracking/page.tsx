import { getServerSupabase } from '@/lib/supabase/server';
import { getCurrentTeamId } from '@/lib/team-helpers';
import { CrewTrackingDashboard } from './components/CrewTrackingDashboard';

export default async function CrewTrackingPage() {
  const supabase = await getServerSupabase();
  const teamId = await getCurrentTeamId();

  if (!teamId) {
    return (
      <div className="p-4 text-sm text-red-400">
        Could not determine team. Please sign in again.
      </div>
    );
  }

  // Fetch active jobs with crew assignments
  const { data: activeJobs } = await supabase
    .from('jobs')
    .select(`
      id,
      address,
      job_type,
      stage,
      contract_value,
      job_crew_assignments!inner(
        crew_id,
        crews(
          id,
          name,
          crew_members(
            id,
            name,
            role,
            user_id
          )
        )
      )
    `)
    .in('stage', ['scheduled', 'in_progress'])
    .order('created_at', { ascending: false });

  // Fetch time entries for today
  const today = new Date().toISOString().split('T')[0];
  const { data: timeEntries } = await supabase
    .from('crew_time_entries')
    .select(`
      id,
      job_id,
      crew_member_id,
      clock_in,
      clock_out,
      total_hours,
      crew_members(
        id,
        name,
        crews(
          id,
          name
        )
      ),
      jobs(
        id,
        address,
        job_type
      )
    `)
    .gte('clock_in', `${today}T00:00:00`)
    .order('clock_in', { ascending: false });

  // Fetch checklists status
  const { data: checklists } = await supabase
    .from('job_checklists')
    .select(`
      id,
      job_id,
      checklist_type,
      completed,
      completed_at,
      jobs(
        id,
        address
      )
    `)
    .eq('checklist_type', 'pre-start')
    .order('created_at', { ascending: false });

  // Fetch material verifications
  const { data: materialVerifications } = await supabase
    .from('material_verification')
    .select(`
      id,
      job_id,
      material_name,
      verified,
      missing,
      created_at,
      jobs(
        id,
        address
      )
    `)
    .order('created_at', { ascending: false })
    .limit(20);

  // Fetch recent issues
  const { data: recentIssues } = await supabase
    .from('job_issues')
    .select(`
      id,
      job_id,
      issue_type,
      severity,
      description,
      status,
      created_at,
      jobs(
        id,
        address
      ),
      crew_members(
        id,
        name
      )
    `)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(10);

  // Fetch safety logs for today
  const { data: safetyLogs } = await supabase
    .from('safety_logs')
    .select(`
      id,
      job_id,
      weather,
      wind_speed,
      compliance,
      created_at,
      jobs(
        id,
        address
      ),
      crew_members(
        id,
        name
      )
    `)
    .gte('created_at', `${today}T00:00:00`)
    .order('created_at', { ascending: false });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Crew Tracking</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Real-time view of all crew activity, time tracking, checklists, and issues
        </p>
      </div>

      <CrewTrackingDashboard
        activeJobs={activeJobs || []}
        timeEntries={timeEntries || []}
        checklists={checklists || []}
        materialVerifications={materialVerifications || []}
        recentIssues={recentIssues || []}
        safetyLogs={safetyLogs || []}
      />
    </div>
  );
}
