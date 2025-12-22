import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type SenderProfile = {
  id: string;
  email: string;
  provider: "gmail" | "outlook" | "smtp";
  daily_limit: number;
  warmup_stage: number;
  bounce_rate: number;
  complaints: number;
  health_score: number;
};

export default async function SendersPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <main className="p-6 max-w-3xl mx-auto">
        <p>Please sign in to view sender health.</p>
      </main>
    );
  }

  const { data: senders, error } = await supabase
    .from("sender_profiles")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch senders:", error);
  }

  const senderProfiles = (senders || []) as SenderProfile[];

  return (
    <main className="p-6 max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Sender Health</h1>

      {senderProfiles.length === 0 ? (
        <div className="rounded-2xl border p-6 text-center text-sm text-muted-foreground">
          No senders connected yet. Connect a Gmail or Outlook account to get started.
        </div>
      ) : (
        <ul className="divide-y rounded-2xl border">
          {senderProfiles.map((s) => {
            const healthColor =
              s.health_score > 80
                ? "text-green-500"
                : s.health_score > 50
                ? "text-yellow-500"
                : "text-red-500";
            
            const bouncePercent = (s.bounce_rate * 100).toFixed(1);

            return (
              <li key={s.id} className="p-4 flex justify-between items-center">
                <div>
                  <div className="font-medium">{s.email}</div>
                  <div className="text-sm opacity-70">
                    Bounce Rate {bouncePercent}% • Limit {s.daily_limit}/day
                    {s.complaints > 0 && ` • ${s.complaints} complaint${s.complaints > 1 ? 's' : ''}`}
                  </div>
                  {s.health_score < 50 && (
                    <div className="text-xs text-red-500 mt-1">
                      ⚠️ Low health score - sending throttled
                    </div>
                  )}
                  {s.bounce_rate > 0.05 && (
                    <div className="text-xs text-yellow-500 mt-1">
                      ⚠️ High bounce rate - review your email list
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end">
                  <div className={`text-sm font-semibold ${healthColor}`}>
                    {s.health_score}/100
                  </div>
                  <div className="text-xs opacity-60">Stage {s.warmup_stage}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="rounded-lg border p-4 bg-muted/50">
        <h2 className="text-sm font-semibold mb-2">About Sender Health</h2>
        <ul className="text-xs space-y-1 text-muted-foreground">
          <li>• Health score is based on bounce rate (last 7 days)</li>
          <li>• New senders start at 25 emails/day and warmup automatically</li>
          <li>• Senders with health &lt; 40 are automatically throttled</li>
          <li>• Daily limit increases by 25/day up to 200 (if health &gt; 70)</li>
        </ul>
      </div>
    </main>
  );
}


