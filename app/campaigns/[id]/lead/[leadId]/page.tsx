import { getLeadTimeline } from "@/lib/data/timeline";
import { deriveLeadState, stateBadgeClasses } from "@/lib/data/lead-state";
import { retryFailedForLead, cancelQueuedForLead, resendFromLog } from "./actions";
import { pauseLead, resumeLead } from "../../actions";
import CopyProviderIdButton from "./CopyProviderIdButton";
import { createServiceClient } from "@/lib/supabase/server";
import { isSuppressed } from "@/lib/hygiene/suppression";
import ViewEmailButton from "./ViewEmailButton";
import { StoCard } from "./StoCard";

export default async function LeadInspector({ params }: { params: { id: string; leadId: string } }) {
  const { id: campaignId, leadId } = params;
  const data = await getLeadTimeline(campaignId, leadId);
  const state = deriveLeadState(data.events);

  // Check suppression status
  const supabase = createServiceClient();
  const { data: camp } = await supabase
    .from("campaigns")
    .select("user_id, default_tz")
    .eq("id", campaignId)
    .maybeSingle();
  
  let suppressedInfo: { email: boolean; domain: boolean; reason?: string } | null = null;
  if (camp?.user_id && data.lead?.email) {
    suppressedInfo = await isSuppressed(camp.user_id, data.lead.email);
  }

  const domain = data.lead?.email ? data.lead.email.split("@")[1] ?? "" : "";
  const { data: supEmail } = camp?.user_id && data.lead?.email ? await supabase
    .from("suppressed_emails")
    .select("id, reason")
    .eq("user_id", camp.user_id)
    .eq("email", data.lead.email.toLowerCase())
    .maybeSingle() : { data: null };
  
  const { data: supDomain } = camp?.user_id && domain ? await supabase
    .from("suppressed_domains")
    .select("id, reason")
    .eq("user_id", camp.user_id)
    .eq("domain", domain.toLowerCase())
    .maybeSingle() : { data: null };

  const { data: sto } = await supabase
    .from("lead_sto_profiles")
    .select("best_hour,best_hour_conf,hist_opens,hist_clicks,updated_at,last_observed_at,tz")
    .eq("campaign_id", campaignId)
    .eq("lead_id", leadId)
    .maybeSingle();

  const lastSent = [...data.raw.logs].sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()).at(-1);
  const providerId = lastSent?.provider_message_id;

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{data.lead?.email}</h1>
            <span className={stateBadgeClasses(state)}>{state}</span>
            {data.lead?.paused_at && (
              <span className="px-2 py-0.5 rounded-full border text-xs border-zinc-400 text-zinc-600">paused</span>
            )}
            {data.lead?.unsubscribed && (
              <span className="px-2 py-0.5 rounded-full border text-xs border-red-400 text-red-600 bg-red-50">
                Unsubscribed {data.lead?.unsubscribed_at ? new Date(data.lead.unsubscribed_at).toLocaleDateString() : ''}
              </span>
            )}
          </div>
          <p className="text-sm opacity-70">
            {data.lead?.first_name} • {data.lead?.company} • {data.lead?.title}
          </p>
        </div>
        <div className="flex gap-2">
          {providerId && (
            <CopyProviderIdButton providerId={providerId} />
          )}
          {data.lead?.paused_at ? (
            <form action={async () => { "use server"; await resumeLead(campaignId, leadId); }}>
              <button className="rounded-xl border px-3 py-2 text-sm">Resume Lead</button>
            </form>
          ) : (
            <form action={async () => { "use server"; await pauseLead(campaignId, leadId, "manual"); }}>
              <button className="rounded-xl border px-3 py-2 text-sm">Pause Lead</button>
            </form>
          )}
          <form action={async () => { "use server"; await retryFailedForLead(campaignId, leadId); }}>
            <button className="rounded-xl border px-3 py-2 text-sm">Retry Failed</button>
          </form>
          <form action={async () => { "use server"; await cancelQueuedForLead(campaignId, leadId); }}>
            <button className="rounded-xl border px-3 py-2 text-sm">Cancel Queued</button>
          </form>
        </div>
      </header>

      {/* Suppression Banner */}
      {(supEmail || supDomain) && (
        <div className="rounded-xl border border-red-500/50 bg-red-50 dark:bg-red-900/20 p-3 text-sm flex items-center justify-between">
          <div>
            <div className="font-medium">
              Suppressed — {supEmail?.reason ?? supDomain?.reason ?? "suppressed"}
            </div>
            <div className="opacity-70 text-xs">{data.lead?.email}</div>
          </div>
          {/* Optional: Add unsuppress button here with admin check */}
        </div>
      )}

      <StoCard
        campaignId={campaignId}
        leadId={leadId}
        initialSto={sto ?? null}
        fallbackTz={sto?.tz ?? data.lead?.timezone ?? camp?.default_tz ?? null}
      />

      {/* Timeline */}
      <div className="rounded-2xl border p-4 space-y-4">
        <h2 className="text-lg font-semibold">Timeline</h2>
        <div className="space-y-3">
          {data.events.map((e: any, i: number) => (
            <div key={i} className="border-l-2 pl-4 border-zinc-200">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="text-sm font-medium capitalize">{e.type}</div>
                  <div className="text-xs opacity-70">{new Date(e.at).toLocaleString()}</div>
                  {e.type === "lead_resumed" && e.meta?.reason === "resume_on_reply" && (
                    <div className="text-xs opacity-70 mt-1">Auto-resumed on reply</div>
                  )}
                  <div className="grid grid-cols-2 gap-1 text-xs opacity-70">
                    {e.status && <div>Status: {e.status}</div>}
                    {e.fail_code && <div>Fail: {e.fail_code}</div>}
                    {e.scheduled_at && <div>Scheduled: {new Date(e.scheduled_at).toLocaleString()}</div>}
                    {e.variant_key && <div>Variant: {e.variant_key}</div>}
                    {e.template_version_label && (
                      <div>Version: {e.template_version_label}</div>
                    )}
                    {e.meta && Object.keys(e.meta).length > 0 && e.type !== "lead_resumed" && (
                      <div className="col-span-2 text-xs opacity-70">Meta: {JSON.stringify(e.meta)}</div>
                    )}
                  </div>
                </div>
                {e.type === "sent" && (
                  <div className="flex items-center gap-2 ml-4">
                    {e.provider_url && (
                      <a
                        href={e.provider_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border px-2 py-1 text-xs hover:bg-zinc-100"
                      >
                        Open in provider
                      </a>
                    )}
                    {e.id && (
                      <>
                        <ViewEmailButton 
                          logId={e.id} 
                          campaignId={campaignId} 
                          leadId={leadId}
                          providerUrl={e.provider_url}
                        />
                        <form
                          action={async () => {
                            "use server";
                            await resendFromLog(campaignId, leadId, e.id);
                          }}
                        >
                          <button
                            type="submit"
                            className="rounded-lg border px-2 py-1 text-xs hover:bg-zinc-100"
                            onClick={(ev) => {
                              if (!confirm("Resend this exact email snapshot to the same lead?")) {
                                ev.preventDefault();
                              }
                            }}
                          >
                            Resend this email
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {data.events.length === 0 && <div className="text-sm opacity-70">No events yet</div>}
        </div>
      </div>

      {/* Debug JSON */}
      <details className="rounded-2xl border p-4">
        <summary className="text-sm font-semibold cursor-pointer">Debug JSON</summary>
        <pre className="mt-4 text-xs overflow-auto">{JSON.stringify(data, null, 2)}</pre>
      </details>
    </main>
  );
}
