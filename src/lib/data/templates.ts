import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function sb() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies }
  );
}

export async function listVersions(campaignId: string, variant: string) {
  const supabase = sb();
  const [versions, active] = await Promise.all([
    supabase
      .from("template_versions")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("variant_key", variant)
      .order("created_at", { ascending: false }),
    supabase
      .from("variant_active_version")
      .select("template_version_id")
      .eq("campaign_id", campaignId)
      .eq("variant_key", variant)
      .maybeSingle(),
  ]);
  return {
    versions: versions.data ?? [],
    activeId: active.data?.template_version_id ?? null,
  };
}

export async function createVersion(opts: {
  campaignId: string;
  variant: string;
  label: string;
  subject: string;
  body_md: string;
  makeActive?: boolean;
}) {
  const supabase = sb();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("template_versions")
    .insert({
      campaign_id: opts.campaignId,
      variant_key: opts.variant,
      version_label: opts.label,
      subject: opts.subject,
      body_md: opts.body_md,
      created_by: user?.id ?? null,
      is_active: !!opts.makeActive,
    })
    .select("*")
    .maybeSingle();
  if (error) throw error;

  if (opts.makeActive) {
    await supabase.from("variant_active_version").upsert({
      campaign_id: opts.campaignId,
      variant_key: opts.variant,
      template_version_id: data!.id,
    });
    await supabase
      .from("template_versions")
      .update({ is_active: false })
      .eq("campaign_id", opts.campaignId)
      .eq("variant_key", opts.variant)
      .neq("id", data!.id);
    await supabase
      .from("template_versions")
      .update({ is_active: true })
      .eq("id", data!.id);
  }
  return data!;
}

export async function setActiveVersion(
  campaignId: string,
  variant: string,
  templateVersionId: string
) {
  const supabase = sb();
  await supabase.from("variant_active_version").upsert({
    campaign_id: campaignId,
    variant_key: variant,
    template_version_id: templateVersionId,
  });
  await supabase
    .from("template_versions")
    .update({ is_active: false })
    .eq("campaign_id", campaignId)
    .eq("variant_key", variant);
  await supabase
    .from("template_versions")
    .update({ is_active: true })
    .eq("id", templateVersionId);
  return { ok: true };
}

