import { getServerSupabase } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export const revalidate = 0;

interface SendLog {
  id: string;
  job_id: string;
  status: "sent" | "failed";
  message: string;
  provider: string | null;
  message_id: string | null;
  error: string | null;
  created_at: string;
}

async function getSendLogs(jobId: string): Promise<SendLog[]> {
  const supabase = getServerSupabase();

  const { data, error } = await supabase
    .from("send_logs")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching send logs:", error);
    return [];
  }

  return (data || []) as SendLog[];
}

async function getJobDetails(jobId: string) {
  const supabase = getServerSupabase();

  const { data, error } = await supabase
    .from("email_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

export default async function SendLogsPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const logs = await getSendLogs(jobId);
  const job = await getJobDetails(jobId);

  if (!job && logs.length === 0) {
    notFound();
  }

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold">Logs for Job {jobId.slice(0, 8)}</h1>
        {job && (
          <div className="mt-2 text-sm text-muted-foreground">
            <div>To: {job.to_email}</div>
            <div>Subject: {job.subject}</div>
            <div>Status: {job.status}</div>
            <div>Provider: {job.provider || "N/A"}</div>
            {job.attempts > 0 && <div>Attempts: {job.attempts}</div>}
            {job.last_error && (
              <div className="text-red-600">Error: {job.last_error}</div>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-lg divide-y bg-card">
        {logs.length > 0 ? (
          logs.map((log) => (
            <div key={log.id} className="p-3 text-sm">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-medium ${
                      log.status === "sent"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {log.status.toUpperCase()}
                  </span>
                  {log.provider && (
                    <span className="text-muted-foreground text-xs">
                      ({log.provider})
                    </span>
                  )}
                  {log.message_id && (
                    <span className="text-muted-foreground text-xs font-mono">
                      ID: {log.message_id.slice(0, 16)}
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground">
                  {new Date(log.created_at).toLocaleString()}
                </div>
              </div>
              <div className="text-muted-foreground whitespace-pre-wrap break-words">
                {log.message}
              </div>
              {log.error && (
                <div className="mt-2 text-red-600 text-xs bg-red-50 p-2 rounded">
                  Error: {log.error}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="p-6 text-muted-foreground text-sm text-center">
            No logs yet.
          </div>
        )}
      </div>
    </div>
  );
}
