import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!(email && list.includes(email.toLowerCase()));
}

export default async function AdminMetricsPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
  const jar = cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return jar.get(name)?.value;
      },
      set() {},
      remove() {},
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdminEmail(user?.email)) {
    return (
      <div className="max-w-2xl mx-auto py-10">
        <h1 className="text-2xl font-semibold">Not authorized</h1>
        <p className="text-sm text-gray-600 mt-2">Your email is not in ADMIN_EMAILS.</p>
      </div>
    );
  }

  // Use service role for admin queries
  const adminSupabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const now = new Date();
  const day24hAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const day7dAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 1. Email sent counts (24h / 7d)
  const { data: emails24h } = await adminSupabase
    .from('email_logs')
    .select('id', { count: 'exact', head: true })
    .gte('sent_at', day24hAgo.toISOString());

  const { data: emails7d } = await adminSupabase
    .from('email_logs')
    .select('id', { count: 'exact', head: true })
    .gte('sent_at', day7dAgo.toISOString());

  const emailsSent24h = (emails24h as any)?.length || 0;
  const emailsSent7d = (emails7d as any)?.length || 0;

  // 2. Deliverability reputation (avg score)
  let avgDeliverabilityScore = 0;
  try {
    const { data: deliverabilityData } = await adminSupabase
      .from('deliverability_reputation')
      .select('score');

    if (deliverabilityData && deliverabilityData.length > 0) {
      avgDeliverabilityScore =
        deliverabilityData.reduce((sum: number, d: any) => sum + (d.score || 0), 0) / deliverabilityData.length;
    }
  } catch (err) {
    // Table might not exist, use default
    avgDeliverabilityScore = 0;
  }

  // 3. Error counts per category from system_logs
  const { data: logStats } = await adminSupabase
    .from('view_log_stats')
    .select('*')
    .eq('level', 'error');

  const errorCountsByCategory: Record<string, number> = {};
  if (logStats) {
    logStats.forEach((stat: any) => {
      errorCountsByCategory[stat.category] = (errorCountsByCategory[stat.category] || 0) + stat.count_24h;
    });
  }

  // 4. Active subscriptions
  const { data: activeSubs } = await adminSupabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .in('plan_status', ['active', 'trialing']);

  const activeCustomers = (activeSubs as any)?.length || 0;

  // 5. Daily email volume for last 7 days (for chart)
  const dailyVolume = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dayStart = new Date(date.setHours(0, 0, 0, 0));
    const dayEnd = new Date(date.setHours(23, 59, 59, 999));

    const { data: dayEmails } = await adminSupabase
      .from('email_logs')
      .select('id', { count: 'exact', head: true })
      .gte('sent_at', dayStart.toISOString())
      .lte('sent_at', dayEnd.toISOString());

    dailyVolume.push({
      date: date.toISOString().slice(0, 10),
      count: (dayEmails as any)?.length || 0,
    });
  }

  // Prepare error chart data
  const errorChartData = Object.entries(errorCountsByCategory).map(([category, count]) => ({
    category,
    errors: count,
  }));

  return (
    <div className="max-w-7xl mx-auto py-10 space-y-6">
      <h1 className="text-2xl font-semibold">System Metrics Dashboard</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-white p-6">
          <div className="text-sm text-slate-500">Emails Sent (24h)</div>
          <div className="text-3xl font-semibold mt-2">{emailsSent24h.toLocaleString()}</div>
          <div className="text-xs text-slate-400 mt-1">7d: {emailsSent7d.toLocaleString()}</div>
        </div>

        <div className="rounded-xl border bg-white p-6">
          <div className="text-sm text-slate-500">Avg Deliverability Score</div>
          <div className="text-3xl font-semibold mt-2">{avgDeliverabilityScore.toFixed(1)}</div>
          <div className="text-xs text-slate-400 mt-1">Across all senders</div>
        </div>

        <div className="rounded-xl border bg-white p-6">
          <div className="text-sm text-slate-500">Error Count (24h)</div>
          <div className="text-3xl font-semibold mt-2">
            {Object.values(errorCountsByCategory).reduce((a, b) => a + b, 0)}
          </div>
          <div className="text-xs text-slate-400 mt-1">Total errors logged</div>
        </div>

        <div className="rounded-xl border bg-white p-6">
          <div className="text-sm text-slate-500">Active Customers</div>
          <div className="text-3xl font-semibold mt-2">{activeCustomers.toLocaleString()}</div>
          <div className="text-xs text-slate-400 mt-1">Active or trialing</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Email Volume */}
        <div className="rounded-xl border bg-white p-6">
          <h2 className="text-lg font-semibold mb-4">Email Volume (Last 7 Days)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyVolume}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} name="Emails Sent" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Error Counts by Category */}
        <div className="rounded-xl border bg-white p-6">
          <h2 className="text-lg font-semibold mb-4">Errors by Category (24h)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={errorChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="errors" fill="#ef4444" name="Errors" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

