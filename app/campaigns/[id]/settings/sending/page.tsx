import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { upsertVariantPacing, deleteVariantPacing } from "./actions";
import { ReplyDetectionToggle } from "@/components/campaigns/ReplyDetectionToggle";
import { ReplyRulesCard } from "@/components/campaigns/ReplyRulesCard";
import { QuietHoursForm } from "@/components/campaigns/QuietHoursForm";
import { SlaPolicyPanel } from "@/app/(settings)/SlaPolicyPanel";

export default async function SendingSettings({ params }: { params: { id: string } }) {
  const cookieStore = await cookies();
  const sb = createServerClient(
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

  const [{ data: overrides }, { data: policy }] = await Promise.all([
    sb.from("variant_pacing")
      .select("id, variant_key, hourly_cap")
      .eq("campaign_id", params.id)
      .order("variant_key"),
    sb.from("campaign_send_policy")
      .select("*")
      .eq("campaign_id", params.id)
      .maybeSingle(),
  ]);

  return (
    <main className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold">Sending Settings</h1>
      
      <section className="rounded-2xl border p-4 space-y-3">
        <h2 className="font-medium">Reply Detection</h2>
        <ReplyDetectionToggle campaignId={params.id} />
      </section>

      <section className="rounded-2xl border p-4 space-y-3">
        <ReplyRulesCard campaignId={params.id} />
      </section>

      <SlaPolicyPanel campaignId={params.id} />

      <section className="rounded-2xl border p-4 space-y-4">
        <div>
          <h2 className="font-medium">Quiet hours & throttling</h2>
          <p className="text-sm text-muted-foreground">
            Configure allowed days, local hours, holiday blocking, and per-thread pacing.
          </p>
        </div>
        <QuietHoursForm campaignId={params.id} initialPolicy={policy ?? null} />
      </section>

      <section className="rounded-2xl border p-4 space-y-3">
        <h2 className="font-medium">Per-variant hourly caps</h2>
        <form action={upsertVariantPacing} className="flex gap-2 items-center">
          <input type="hidden" name="campaignId" value={params.id} />
          <input 
            name="variant_key" 
            placeholder="default or A/B key" 
            className="rounded-xl border px-3 py-2 text-sm" 
          />
          <input 
            name="hourly_cap" 
            type="number" 
            min="1" 
            className="rounded-xl border px-3 py-2 text-sm w-28" 
            placeholder="200" 
          />
          <button className="rounded-xl border px-3 py-2 text-sm">Add / Update</button>
        </form>
        <ul className="text-sm">
          {(overrides ?? []).map((o: any) => (
            <li key={o.id} className="flex items-center justify-between border-b py-2">
              <div>{o.variant_key} — {o.hourly_cap}/h</div>
              <form action={deleteVariantPacing}>
                <input type="hidden" name="id" value={o.id} />
                <button className="rounded-xl border px-3 py-1.5 text-xs">Delete</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

