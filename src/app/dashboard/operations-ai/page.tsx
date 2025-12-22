// Block 254100 — Operations AI Director Dashboard Page
// The AI Director Report for roofing operations

import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase/server';
import { getActiveWorkspaceId } from '@/lib/workspace/context';
import { OperationsAIDirectorDashboard } from '@/components/operations/OperationsAIDirectorDashboard';

export const metadata: Metadata = {
  title: 'AI Director Report · SmartSend',
  description: 'AI predicts delays, optimizes crew assignments, prevents mistakes, auto-schedules materials, auto-fixes bottlenecks',
};

export default async function OperationsAIDirectorPage() {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    redirect('/welcome');
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Operations AI Director
          </h1>
          <p className="text-sm text-muted-foreground">
            AI predicts delays, optimizes crew assignments, prevents mistakes, auto-schedules materials, auto-fixes bottlenecks
          </p>
        </div>
      </header>

      <OperationsAIDirectorDashboard workspaceId={workspaceId} />
    </div>
  );
}






















