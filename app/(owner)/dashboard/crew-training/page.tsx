// Block 67000 — SmartSend Roofing "AI Crew Training Insights + Skill Gap Detection System" v1
// Crew Training Dashboard Page

import { CrewTrainingDashboard } from '@/components/dashboard/CrewTrainingDashboard';
import { getCurrentTeamId } from '@/lib/team-helpers';

export default async function CrewTrainingPage() {
  const workspaceId = await getCurrentTeamId();

  if (!workspaceId) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-8">
          <p className="text-slate-500">No workspace selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <CrewTrainingDashboard workspaceId={workspaceId} />
    </div>
  );
}




























