import Link from "next/link";
import { getAiSdrThreads } from "@/lib/aiSdr";
import { Badge } from "@/src/components/ui/badge";
import { Input } from "@/src/components/ui/Input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/src/components/ui/tabs";
import { Button } from "@/src/components/ui/Button";

export default async function AiSdrPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string; health?: string; inbox?: string };
}) {
  const status = searchParams.status ?? "all";
  const q = searchParams.q ?? "";
  const health = searchParams.health ?? "all";
  const inbox = searchParams.inbox ?? "active";

  const threads = await getAiSdrThreads({ status, search: q, health, inbox });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">AI SDR Console</h1>
          <p className="text-sm text-muted-foreground">
            Autopilot threads, AI events, and meeting outcomes in one place.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/ai-sdr/analytics">Analytics</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/ai-sdr/settings">AI SDR Settings</Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="threads" value="threads">
        <TabsList>
          <TabsTrigger value="threads">Threads</TabsTrigger>
          <TabsTrigger value="review" asChild>
            <Link href="/dashboard/ai-sdr/review">Review Queue</Link>
          </TabsTrigger>
          <TabsTrigger value="analytics" asChild>
            <Link href="/dashboard/ai-sdr/analytics">Analytics</Link>
          </TabsTrigger>
          <TabsTrigger value="settings" asChild>
            <Link href="/dashboard/ai-sdr/settings">Settings</Link>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="threads" className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <form action="/dashboard/ai-sdr" method="get" className="flex items-center gap-3">
              <Input
                defaultValue={q}
                placeholder="Search by lead email…"
                className="max-w-xs"
                name="q"
              />
              {status !== "all" && (
                <input type="hidden" name="status" value={status} />
              )}
              {health !== "all" && (
                <input type="hidden" name="health" value={health} />
              )}
              {inbox !== "active" && inbox !== "all" && (
                <input type="hidden" name="inbox" value={inbox} />
              )}
              <Button type="submit" size="sm" variant="outline">
                Search
              </Button>
            </form>
            <div className="flex flex-wrap gap-2">
              <div className="flex gap-2">
                {[
                  "all",
                  "awaiting_reply",
                  "idle",
                  "followup_scheduled",
                  "closed_won",
                  "closed_lost",
                ].map((s) => (
                  <Link
                    key={s}
                    href={`/dashboard/ai-sdr?status=${s}&health=${health}&inbox=${inbox}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  >
                    <Badge
                      variant={s === status ? "default" : "outline"}
                      className="capitalize cursor-pointer"
                    >
                      {s.replace("_", " ")}
                    </Badge>
                  </Link>
                ))}
              </div>
              <div className="flex gap-2">
                {["all", "hot", "warm", "cold"].map((h) => (
                  <Link
                    key={h}
                    href={`/dashboard/ai-sdr?status=${status}&health=${h}&inbox=${inbox}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  >
                    <Badge
                      variant={h === health ? "default" : "outline"}
                      className="capitalize cursor-pointer"
                    >
                      {h === "all" ? "All Heat" : h}
                    </Badge>
                  </Link>
                ))}
              </div>
              <div className="flex gap-2">
                {["active", "archived", "muted", "dismissed", "all"].map((state) => (
                  <Link
                    key={state}
                    href={`/dashboard/ai-sdr?status=${status}&health=${health}&inbox=${state}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  >
                    <Badge
                      variant={state === inbox ? "default" : "outline"}
                      className="capitalize cursor-pointer"
                    >
                      {state}
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr className="text-left">
                  <th className="px-4 py-2">Lead</th>
                  <th className="px-4 py-2">Campaign</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Health</th>
                  <th className="px-4 py-2">Inbox State</th>
                  <th className="px-4 py-2">Objection</th>
                  <th className="px-4 py-2">Next Best Move</th>
                  <th className="px-4 py-2">Summary</th>
                  <th className="px-4 py-2">Last Message</th>
                  <th className="px-4 py-2">Next Action</th>
                  <th className="px-4 py-2">AI Last Event</th>
                  <th className="px-4 py-2 text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {threads?.map((t: any) => (
                  <tr key={t.thread_id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <div className="font-medium">{t.lead_name}</div>
                      <div className="text-xs text-muted-foreground">{t.lead_email}</div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-xs">{t.campaign_name ?? "—"}</div>
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="capitalize">
                        {t.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      {t.health_label ? (
                        <Badge
                          className="capitalize"
                          variant={
                            t.health_label === "hot"
                              ? "default"
                              : t.health_label === "warm"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {t.health_label} · {t.health_score ?? 0}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unscored</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <Badge
                        variant={
                          t.inbox_state === "active"
                            ? "default"
                            : t.inbox_state === "archived"
                            ? "secondary"
                            : t.inbox_state === "muted"
                            ? "outline"
                            : "outline"
                        }
                        className="capitalize"
                      >
                        {t.inbox_state || "active"}
                      </Badge>
                      {t.inbox_state_reason && (
                        <div className="text-muted-foreground text-[11px] mt-1">
                          {t.inbox_state_reason}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {t.last_objection_type ? (
                        <Badge variant="destructive" className="capitalize">
                          {t.last_objection_type.replace(/_/g, " ")}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {t.next_best_action ? (
                        <div>
                          <div className="font-medium capitalize">
                            {t.next_best_action.replace(/_/g, " ")}
                          </div>
                          <div className="text-muted-foreground">
                            {t.next_best_action_reason}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground max-w-sm">
                      {t.summary ? t.summary : "No summary yet"}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <div>{t.last_message_from === "lead" ? "Lead" : "You/AI"}</div>
                      <div className="text-muted-foreground">
                        {t.last_message_at
                          ? new Date(t.last_message_at).toLocaleString()
                          : "—"}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {t.next_action_at ? (
                        <div className="text-muted-foreground">
                          {new Date(t.next_action_at).toLocaleString()}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {t.last_ai_event_type ? (
                        <>
                          <div className="capitalize">
                            {t.last_ai_event_type.replace("_", " ")}
                          </div>
                          <div className="text-muted-foreground">
                            {t.last_ai_event_at &&
                              new Date(t.last_ai_event_at).toLocaleString()}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/dashboard/ai-sdr/${t.thread_id}`}>View</Link>
                      </Button>
                    </td>
                  </tr>
                ))}

                {threads?.length === 0 && (
                  <tr>
                    <td
                      className="px-4 py-6 text-center text-muted-foreground text-sm"
                      colSpan={12}
                    >
                      No AI SDR threads yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
