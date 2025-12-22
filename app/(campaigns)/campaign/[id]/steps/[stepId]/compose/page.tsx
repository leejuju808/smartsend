import { SmartRewriter } from "@/app/(composer)/components/SmartRewriter";
import { createClient } from "@/lib/supabase/server";

export default async function ComposePage({
  params,
}: {
  params: { id: string; stepId: string };
}) {
  const supabase = createClient();

  const [{ data: step, error: stepError }, { data: draft, error: draftError }] = await Promise.all([
    supabase
      .from("campaign_steps")
      .select("id, campaign_id")
      .eq("id", params.stepId)
      .maybeSingle(),
    supabase
      .from("step_drafts")
      .select("subject, body")
      .eq("step_id", params.stepId)
      .maybeSingle(),
  ]);

  if (stepError) {
    console.error(stepError);
  }
  if (draftError) {
    console.error(draftError);
  }

  const campaignId = step?.campaign_id ?? params.id;
  const initialSubject = draft?.subject ?? "Quick question for {{first_name}}";
  const initialBody = draft?.body ?? "Hi {{first_name}},\n\n…";

  if (!step) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Compose — Smart Rewriter</h1>
        <p className="text-sm text-muted-foreground">
          Step not found. Please return to your campaign steps list.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Compose — Smart Rewriter</h1>
      <SmartRewriter
        campaignId={campaignId}
        stepId={step.id}
        initialSubject={initialSubject}
        initialBody={initialBody}
      />
    </div>
  );
}




