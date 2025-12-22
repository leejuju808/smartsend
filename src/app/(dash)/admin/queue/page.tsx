import { getQueueHealth } from "@/lib/db/queueHealth";

export default async function QueueAdminPage() {
  const { health, hist, deadletters } = await getQueueHealth();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Sending Pipeline</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
        {Object.entries({
          Pending: health?.pending ?? 0,
          Scheduled: health?.scheduled ?? 0,
          Deferred: health?.deferred ?? 0,
          Sending: health?.sending ?? 0,
          Sent: health?.sent ?? 0,
          Failed: health?.failed ?? 0,
          "Dead Letters": health?.dead_letters ?? 0,
        }).map(([label, value]) => (
          <div key={label} className="rounded-2xl border p-4">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="text-2xl font-semibold">{value as number}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border p-4">
        <div className="text-sm text-muted-foreground mb-3">Retry Attempts Histogram</div>
        <div className="grid grid-cols-2 md:grid-cols-6 lg:grid-cols-10 gap-2">
          {hist.map((h: any) => (
            <div key={h.attempt_count} className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">Attempt {h.attempt_count}</div>
              <div className="text-lg font-semibold">{h.items}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-muted-foreground">Recent Dead Letters</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="p-2">When</th>
                <th className="p-2">Email</th>
                <th className="p-2">Code</th>
                <th className="p-2">Message</th>
                <th className="p-2">Attempts</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {deadletters.map((d: any) => (
                <tr key={d.deadletter_id} className="border-t">
                  <td className="p-2">{new Date(d.created_at).toLocaleString()}</td>
                  <td className="p-2">{d.email ?? "—"}</td>
                  <td className="p-2">{d.error_code ?? "—"}</td>
                  <td className="p-2">{(d.error_msg ?? "—").slice(0, 120)}</td>
                  <td className="p-2">{d.attempt_count}</td>
                  <td className="p-2">
                    <form action={`/api/admin/deadletters/resubmit?id=${d.deadletter_id}`} method="post">
                      <button className="px-3 py-1 rounded-lg border">Resubmit</button>
                    </form>
                  </td>
                </tr>
              ))}
              {deadletters.length === 0 && (
                <tr>
                  <td className="p-2 text-muted-foreground" colSpan={6}>
                    No dead letters 🎉
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}












