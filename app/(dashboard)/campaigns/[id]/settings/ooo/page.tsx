import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { AutoNudgeOOO } from "../AutoNudgeOOO";
import OOOSettings from "../OOOSettings";
import { SendingPrefs } from "../SendingPrefs";

export default async function CampaignOOOSettingsPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerComponentClient({ cookies });
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("ooo_autonudge_enabled")
    .eq("id", params.id)
    .maybeSingle();

  const autoNudgeEnabled = campaign?.ooo_autonudge_enabled ?? true;

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">OOO Auto-Resume</h1>
        <p className="text-sm text-muted-foreground">
          Configure how this campaign resumes leads automatically after out-of-office pauses.
        </p>
      </header>
      <section className="space-y-3 rounded-2xl border border-muted-foreground/10 p-4">
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-foreground">Courtesy Auto-Nudge</h2>
          <p className="text-xs text-muted-foreground">
            Automatically follow up the morning after a lead returns from an out-of-office reply.
          </p>
        </div>
        <AutoNudgeOOO initial={autoNudgeEnabled} campaignId={params.id} />
      </section>
      <SendingPrefs campaignId={params.id} />
      <OOOSettings campaignId={params.id} />
    </main>
  );
}

