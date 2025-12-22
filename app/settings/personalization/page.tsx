import { redirect } from "next/navigation";
import PersonalizationPanel from "@/app/(settings)/personalization/PersonalizationPanel";
import { createClient } from "@/lib/supabase/server";

export default async function PersonalizationSettingsPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Personalization Snippets</h1>
        <p className="text-sm text-muted-foreground">
          Store proof points by role, industry, region, and tech stack. We&apos;ll auto-inject the best snippet
          into each follow-up and learn which one wins.
        </p>
      </div>
      <PersonalizationPanel />
    </div>
  );
}

















