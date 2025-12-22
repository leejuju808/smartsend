import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export default async function SendingPage() {
  const sb = supabaseAdmin;
  const workspaceId = process.env.NEXT_PUBLIC_DEMO_WORKSPACE_ID!;
  await sb.rpc('app.set_workspace', { id: workspaceId });

  const { data: pol } = await sb.from('send_policies').select('*').eq('workspace_id', workspaceId).maybeSingle();
  const today = new Date().toISOString().slice(0,10);
  const { data: ctrs } = await sb
    .from('send_counters')
    .select('domain, day, sent_count, cooldown_until')
    .eq('day', today)
    .order('sent_count', { ascending: false });

  // Get recent audit logs
  const { data: audit } = await sb
    .from('sending_audit')
    .select('domain, to_email, allowed, reason, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(20);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Sending Limits & Warm-Up</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Policy Overview */}
        <div className="rounded-2xl border p-4 space-y-4">
          <div className="font-semibold text-lg">Sending Policy</div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Warm-up Enabled:</span>
              <span className={pol?.warmup_enabled ? 'text-green-600' : 'text-red-600'}>
                {pol?.warmup_enabled ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Start Per Day:</span>
              <span>{pol?.ramp_start_per_day || 25}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Weekly Increment:</span>
              <span>{pol?.weekly_increment || 25}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Max Per Day:</span>
              <span>{pol?.ramp_max_per_day || 500}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Domain Max:</span>
              <span>{pol?.domain_max_per_day || 200}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Bounce Threshold:</span>
              <span>{(Number(pol?.bounce_rate_threshold || 0.05) * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Cooldown:</span>
              <span>{pol?.cooldown_minutes || 1440} min</span>
            </div>
          </div>
          <div className="text-sm text-gray-500">
            Edit via SQL for now; UI editor can be added later.
          </div>
        </div>

        {/* Today's Status */}
        <div className="rounded-2xl border p-4 space-y-4">
          <div className="font-semibold text-lg">Today's Status ({today})</div>
          <div className="space-y-3">
            {ctrs && ctrs.length > 0 ? (
              ctrs.map((r: any) => (
                <div key={r.domain} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-medium">{r.domain}</div>
                    <div className="text-sm text-gray-600">
                      {r.sent_count} sent
                      {r.cooldown_until && (
                        <span className="text-red-600 ml-2">
                          (cooldown until {new Date(r.cooldown_until).toLocaleTimeString()})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-gray-500 text-center py-4">No sends today</div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="rounded-2xl border p-4">
        <div className="font-semibold text-lg mb-4">Recent Sending Activity</div>
        <div className="space-y-2">
          {audit && audit.length > 0 ? (
            audit.map((r: any) => (
              <div key={r.created_at} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <div className="font-medium">{r.to_email}</div>
                  <div className="text-sm text-gray-600">{r.domain}</div>
                </div>
                <div className="text-right">
                  <div className={`text-sm ${r.allowed ? 'text-green-600' : 'text-red-600'}`}>
                    {r.allowed ? 'Allowed' : 'Blocked'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(r.created_at).toLocaleTimeString()}
                  </div>
                  {r.reason && r.reason !== 'sent' && (
                    <div className="text-xs text-red-500">{r.reason}</div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-gray-500 text-center py-4">No recent activity</div>
          )}
        </div>
      </div>

      {/* Quick Test */}
      <div className="rounded-2xl border p-4">
        <div className="font-semibold text-lg mb-4">Test Guarded Send</div>
        <div className="text-sm text-gray-600 mb-4">
          Use the API endpoint to test the sending guardrails:
        </div>
        <div className="bg-gray-100 p-3 rounded-lg font-mono text-sm">
          POST /api/sending/guarded-send
          <br />
          Body: {"{"}workspaceId, toEmail, subject, html, text{"}"}
        </div>
      </div>
    </div>
  );
} 