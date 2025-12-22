import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export default async function InboundPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // server component read for simplicity
  );

  // In production, read with the user's JWT & RLS via a server action; keeping it simple here.
  const { data, error } = await supabase
    .from("inbound_messages")
    .select("created_at, provider, sender_email, subject, processed_status, detector_status")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Inbound Messages (last 50)</h1>
      {error && <div className="text-red-600">Error: {error.message}</div>}
      <div className="grid grid-cols-1 gap-3">
        {(data || []).map((row, idx) => (
          <div key={idx} className="rounded-2xl border p-4">
            <div className="text-xs text-gray-500">
              {new Date(row.created_at).toLocaleString()} · {row.provider}
            </div>
            <div className="text-sm font-medium">{row.sender_email}</div>
            <div className="text-sm text-gray-600">{row.subject || "(no subject)"}</div>
            <div className="text-sm mt-2">
              Status: <span className="font-medium">{row.processed_status}</span>
              {row.detector_status ? (
                <> · Detector: <span className="font-medium">{row.detector_status}</span></>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
