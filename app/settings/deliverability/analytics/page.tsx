import { getDeliverabilityDaily } from "@/lib/data/deliverability";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";

export default async function DeliverabilityAnalytics({ searchParams }: { searchParams: { teamId?: string } }) {
  // For MVP, we'll get teamId from query params
  // In production, you'd want to get it from session/cookie
  const teamId = searchParams.teamId || "test-team-id"; // TODO: Get from auth context
  
  if (!teamId || teamId === "test-team-id") {
    return (
      <main className="p-6 space-y-8 max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold">Deliverability Analytics</h1>
        <div className="rounded-2xl border p-8 text-center">
          <p className="text-gray-600">Please select a team to view analytics</p>
        </div>
      </main>
    );
  }

  const data = await getDeliverabilityDaily(teamId, 30);

  const fmt = (d: string) => new Date(d).toLocaleDateString();

  return (
    <main className="p-6 space-y-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold">Deliverability Analytics</h1>

      {/* Volume */}
      <section className="rounded-2xl border p-4 space-y-2">
        <h2 className="text-lg font-semibold">Daily Volume</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickFormatter={fmt} />
              <YAxis />
              <Tooltip labelFormatter={(v)=>fmt(v as string)} />
              <Legend />
              <Bar dataKey="sent" name="Sent" fill="#8884d8" />
              <Bar dataKey="replies" name="Replies" fill="#82ca9d" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Rates */}
      <section className="rounded-2xl border p-4 space-y-2">
        <h2 className="text-lg font-semibold">Rates (%)</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickFormatter={fmt} />
              <YAxis domain={[0, 'auto']} />
              <Tooltip labelFormatter={(v)=>fmt(v as string)} />
              <Legend />
              <Line type="monotone" dataKey="reply_rate_pct" name="Reply %" dot={false} stroke="#82ca9d" />
              <Line type="monotone" dataKey="bounce_rate_pct" name="Bounce %" dot={false} stroke="#ff7300" />
              <Line type="monotone" dataKey="complaint_rate_pct" name="Complaint %" dot={false} stroke="#ff0000" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Breakdown */}
      <section className="rounded-2xl border p-4 space-y-2">
        <h2 className="text-lg font-semibold">Bounce Breakdown</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickFormatter={fmt} />
              <YAxis />
              <Tooltip labelFormatter={(v)=>fmt(v as string)} />
              <Legend />
              <Bar dataKey="soft_bounces" name="Soft" fill="#ffc658" />
              <Bar dataKey="hard_bounces" name="Hard" fill="#ff7300" />
              <Bar dataKey="complaints" name="Complaints" fill="#ff0000" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </main>
  );
}

