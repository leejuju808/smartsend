import SuppressionToggles from "../SuppressionToggles";
import { getSuppPrefs } from "@/lib/db/suppPrefs";

export default async function CampaignSuppressionSettings({
  params,
}: {
  params: { id: string };
}) {
  const prefs = await getSuppPrefs(params.id);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Suppression Preferences</h1>
        <p className="text-sm text-muted-foreground">
          Control how this campaign respects tenant-wide blocks and
          unsubscribe lists.
        </p>
      </header>
      <SuppressionToggles
        campaignId={params.id}
        initial={{
          respect_global_suppressions: !!prefs?.respect_global_suppressions,
          respect_cross_campaign_unsubs: !!prefs?.respect_cross_campaign_unsubs,
          respect_domain_blocks: !!prefs?.respect_domain_blocks,
        }}
      />
    </main>
  );
}












