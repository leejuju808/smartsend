import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function sbAdmin() { 
  return new (createClient as any)(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY!, 
    { auth: { persistSession: false } }
  ); 
}

export default async function PrefsPage() {
  const sb = sbAdmin();
  
  // For demo purposes, use a demo workspace ID
  // In production, this would come from the authenticated user's session
  const workspaceId = process.env.NEXT_PUBLIC_DEMO_WORKSPACE_ID || 'demo-workspace-id';
  
  try {
    await sb.rpc('app.set_workspace', { id: workspaceId });

    const { data: events } = await sb
      .from('unsubscribe_events')
      .select('email, action, sequence_id, created_at, reason')
      .order('created_at', { ascending: false })
      .limit(100);

    const { data: prefs } = await sb
      .from('email_preferences')
      .select('email, global_opt_out, updated_at')
      .order('updated_at', { ascending: false })
      .limit(100);

    const { data: sequenceOptOuts } = await sb
      .from('sequence_opt_outs')
      .select('email, sequence_id, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Preferences & Unsubscribes</h1>
          <div className="text-sm text-gray-500">
            Workspace: {workspaceId === 'demo-workspace-id' ? 'Demo Mode' : workspaceId}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Recent Unsubscribe Events */}
          <div className="lg:col-span-2 rounded-2xl border overflow-hidden">
            <div className="p-4 font-semibold border-b bg-gray-50">Recent Unsubscribe Events</div>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b bg-gray-50">
                    <th className="p-3 font-medium">Email</th>
                    <th className="p-3 font-medium">Action</th>
                    <th className="p-3 font-medium">Sequence</th>
                    <th className="p-3 font-medium">Reason</th>
                    <th className="p-3 font-medium">At</th>
                  </tr>
                </thead>
                <tbody>
                  {(events || []).map((r: any, i: number) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="p-3 font-mono text-xs">{r.email}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          r.action === 'global' 
                            ? 'bg-red-100 text-red-700' 
                            : r.action === 'sequence' 
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {r.action}
                        </span>
                      </td>
                      <td className="p-3 text-xs">
                        {r.sequence_id ? r.sequence_id.slice(0, 8) + '...' : '-'}
                      </td>
                      <td className="p-3 text-xs text-gray-600">
                        {r.reason || '-'}
                      </td>
                      <td className="p-3 text-xs text-gray-500">
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  {(!events || events.length === 0) && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-gray-500">
                        No unsubscribe events yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Global Opt-Outs */}
          <div className="rounded-2xl border overflow-hidden">
            <div className="p-4 font-semibold border-b bg-gray-50">Global Opt-Outs</div>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b bg-gray-50">
                    <th className="p-3 font-medium">Email</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {(prefs || []).map((p: any, i: number) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="p-3 font-mono text-xs">{p.email}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          p.global_opt_out 
                            ? 'bg-red-100 text-red-700' 
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {p.global_opt_out ? 'Opted Out' : 'Subscribed'}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-gray-500">
                        {new Date(p.updated_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  {(!prefs || prefs.length === 0) && (
                    <tr>
                      <td colSpan={3} className="p-6 text-center text-gray-500">
                        No preferences set yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sequence Opt-Outs */}
        <div className="rounded-2xl border overflow-hidden">
          <div className="p-4 font-semibold border-b bg-gray-50">Sequence-Specific Opt-Outs</div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b bg-gray-50">
                  <th className="p-3 font-medium">Email</th>
                  <th className="p-3 font-medium">Sequence ID</th>
                  <th className="p-3 font-medium">Opted Out At</th>
                </tr>
              </thead>
              <tbody>
                {(sequenceOptOuts || []).map((s: any, i: number) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="p-3 font-mono text-xs">{s.email}</td>
                    <td className="p-3 font-mono text-xs">
                      {s.sequence_id ? s.sequence_id.slice(0, 8) + '...' : '-'}
                    </td>
                    <td className="p-3 text-xs text-gray-500">
                      {new Date(s.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {(!sequenceOptOuts || sequenceOptOuts.length === 0) && (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-gray-500">
                      No sequence opt-outs yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid md:grid-cols-4 gap-4">
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{events?.length || 0}</div>
            <div className="text-sm text-gray-600">Total Events</div>
          </div>
          <div className="bg-white border rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-red-600">
            {(prefs || []).filter((p: any) => p.global_opt_out).length}
          </div>
            <div className="text-sm text-gray-600">Global Opt-Outs</div>
          </div>
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{sequenceOptOuts?.length || 0}</div>
            <div className="text-sm text-gray-600">Sequence Opt-Outs</div>
          </div>
          <div className="bg-white border rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-gray-900">
            {(events || []).filter((e: any) => e.action === 'global').length}
          </div>
            <div className="text-sm text-gray-600">Today's Unsubscribes</div>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error loading preferences data:', error);
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Preferences & Unsubscribes</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-800">Error loading data. Please check your database connection and try again.</div>
        </div>
      </div>
    );
  }
} 