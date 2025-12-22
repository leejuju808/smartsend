"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getCampaignRole } from "@/lib/auth/role";
import { can } from "@/lib/auth/permissions";

export async function updateSendWindow(formData: FormData) {
  const campaignId = String(formData.get("campaignId"));
  const start = Math.max(0, Math.min(23, Number(formData.get("start")) || 8));
  const end = Math.max(0, Math.min(23, Number(formData.get("end")) || 18));
  const skip_weekends = formData.get("skip_weekends") === "on";

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

  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");

  await sb.from("campaigns").update({
    send_window_start: start,
    send_window_end: end,
    skip_weekends
  }).eq("id", campaignId);

  return { ok: true };
}

export async function upsertVariantPacing(formData: FormData) {
  const campaignId = String(formData.get("campaignId"));
  const variant_key = String(formData.get("variant_key") || "default");
  const hourly_cap = Math.max(1, Number(formData.get("hourly_cap")) || 200);

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

  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");

  await sb
    .from("variant_pacing")
    .upsert({ campaign_id: campaignId, variant_key, hourly_cap }, { onConflict: "campaign_id,variant_key" });
  return { ok: true };
}

export async function deleteVariantPacing(formData: FormData) {
  const id = String(formData.get("id"));

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

  await sb.from("variant_pacing").delete().eq("id", id);
  return { ok: true };
}

