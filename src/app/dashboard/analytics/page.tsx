import { supabaseAdmin } from "@/server/supabase";

export default async function AnalyticsPage() {
  const { data } = await supabaseAdmin
    .from("events")
    .select("event, count:id")
    .group("event");
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Analytics</h1>
      <table className="border w-full">
        <thead><tr><th className="p-2 text-left">Event</th><th className="p-2">Count</th></tr></thead>
        <tbody>
          {data?.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="p-2">{r.event}</td>
              <td className="p-2 text-center">{r.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
} 