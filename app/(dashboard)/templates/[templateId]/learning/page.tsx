import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import LearningPanel from "./_components/LearningPanel";

export default async function LearningTemplatePage({
  params,
}: {
  params: { templateId: string };
}) {
  const supabase = createServerComponentClient({ cookies });

  const { data: template, error: templateErr } = await supabase
    .from("smart_templates")
    .select("id,name,explore_ratio,status,account_id")
    .eq("id", params.templateId)
    .maybeSingle();

  if (templateErr || !template) {
    notFound();
  }

  const { data: versions } = await supabase
    .from("smart_template_versions")
    .select(
      "id,status,author,subject,body,created_at,parent_version_id,notes,weight",
    )
    .eq("template_id", params.templateId)
    .order("created_at", { ascending: false });

  const { data: perf } = await supabase
    .from("v_template_version_perf")
    .select("*")
    .eq("template_id", params.templateId);

  return (
    <LearningPanel
      template={template}
      versions={versions ?? []}
      perf={perf ?? []}
    />
  );
}


