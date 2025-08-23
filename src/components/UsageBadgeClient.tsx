'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@/lib/supabase';

export default function UsageBadgeClient({ userId }: { userId: string }) {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    async function fetchUsage() {
      try {
        // Get user's team
        const { data: prof } = await supabase
          .from('profiles')
          .select('team_id')
          .eq('id', userId)
          .single();

        if (!prof?.team_id) {
          setLoading(false);
          return;
        }

        // Get team's current period
        const { data: team } = await supabase
          .from('teams')
          .select('current_period_start, current_period_end')
          .eq('id', prof.team_id)
          .single();

        if (!team?.current_period_start) {
          setLoading(false);
          return;
        }

        // Count AI replies in current period
        const { count: replyCount } = await supabase
          .from('ai_reply_events')
          .select('id', { count: 'exact', head: true })
          .eq('team_id', prof.team_id)
          .gte('created_at', team.current_period_start)
          .lte('created_at', team.current_period_end || new Date().toISOString());

        setCount(replyCount || 0);
      } catch (error) {
        console.error('Failed to fetch usage:', error);
        setCount(0);
      } finally {
        setLoading(false);
      }
    }

    if (userId) {
      fetchUsage();
    }
  }, [userId, supabase]);

  if (loading || count === null) {
    return null;
  }

  return (
    <div className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">
      {count} AI replies this period
    </div>
  );
} 