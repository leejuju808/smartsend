import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { ReplyBrainSettingsForm } from "./ReplyBrainSettingsForm";

export default async function ReplyBrainSettings() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  // Get user's account_id (assuming accounts table has user_id or similar)
  // Adjust this query based on your actual accounts table structure
  const { data: account } = await sb
    .from("accounts")
    .select("id")
    .maybeSingle();

  if (!account) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">No account found. Please set up your account first.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { data: policy } = await sb
    .from("reply_brain_policy")
    .select("*")
    .eq("account_id", account.id)
    .maybeSingle();

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Adaptive Reply Brain</CardTitle>
          <CardDescription>
            Configure AI-powered reply classification and automated actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReplyBrainSettingsForm 
            accountId={account.id}
            initialPolicy={policy}
          />
        </CardContent>
      </Card>
    </div>
  );
}















