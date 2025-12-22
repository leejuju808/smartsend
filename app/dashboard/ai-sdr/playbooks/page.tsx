import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export default async function PlaybooksPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <div>Unauthorized</div>;
  }

  const { data: playbooks } = await supabase
    .from("ai_sdr_playbooks")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">AI SDR Playbooks</h1>
          <p className="text-sm text-muted-foreground">
            Define how Autopilot should talk to each persona and campaign.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/ai-sdr/playbooks/new">New Playbook</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="space-y-2">
            {playbooks?.map((p: any) => (
              <Link
                key={p.id}
                href={`/dashboard/ai-sdr/playbooks/${p.id}`}
                className="block border rounded-xl p-3 hover:bg-muted/40 transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.target_persona || "General persona"}
                    </div>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {p.approach_style ?? "balanced"}
                  </Badge>
                </div>
                {p.primary_goal && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Goal: {p.primary_goal}
                  </div>
                )}
              </Link>
            ))}

            {(!playbooks || playbooks.length === 0) && (
              <p className="text-sm text-muted-foreground">
                No playbooks yet. Create one to teach Autopilot your sales style.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


