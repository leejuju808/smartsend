// Block 8410 — Smart Template Rewriter v1
// app/(dashboard)/templates/[templateId]/page.tsx

import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { TemplateEditor } from "./_components/template-editor";

export default async function TemplatePage({
  params,
}: {
  params: { templateId: string };
}) {
  const supabase = createServerComponentClient({ cookies });

  const { data: template } = await supabase
    .from("email_templates")
    .select("id, name, subject, body")
    .eq("id", params.templateId)
    .single();

  const { data: variants } = await supabase
    .from("template_variants")
    .select("id, label, intent, subject, body, created_at")
    .eq("template_id", params.templateId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!template) {
    return <div className="p-6">Template not found.</div>;
  }

  return (
    <div className="space-y-6">
      <TemplateEditor template={template} variants={variants ?? []} />
    </div>
  );
}

