import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SuppressionDashboard } from "@/components/suppression/suppression-dashboard";

type PageProps = {
  params: Promise<{
    workspaceSlug: string;
  }>;
};

export default async function SuppressionPage({ params }: PageProps) {
  const supabase = createClient();
  const { workspaceSlug } = await params;

  // Query workspace by slug
  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("id, name, slug")
    .eq("slug", workspaceSlug)
    .single();

  if (error || !workspace) {
    // Redirect to app root if workspace not found
    redirect("/app");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Suppression List
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your global do-not-send emails for{" "}
          <span className="font-medium">{workspace.name}</span>.
        </p>
      </div>

      <SuppressionDashboard workspaceId={workspace.id} />
    </div>
  );
}

