"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WarmupSettingsCard } from "./WarmupSettingsCard";
import { WarmupCheckCard } from "./WarmupCheckCard";
import { supabaseBrowser } from "@/lib/supabase/client";
import { toast } from "sonner";

type ConnectedAccount = {
  id: string;
  email: string;
  email_address?: string;
  provider: "gmail" | "outlook";
  domain?: string;
  last_risk_score?: number;
  last_risk_reason?: any;
  last_risk_checked_at?: string;
  suggested_daily_limit?: number;
};

export default function WarmupSection() {
  const [accounts, setAccounts] = React.useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    try {
      setLoading(true);
      const supabase = supabaseBrowser();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return;
      }

      // Try workspace-based query first
      const { data: workspaceData } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      let query = supabase
        .from("connected_accounts")
        .select("id, email, email_address, provider, domain, last_risk_score, last_risk_reason, last_risk_checked_at, suggested_daily_limit");

      if (workspaceData?.workspace_id) {
        query = query.eq("workspace_id", workspaceData.workspace_id);
      } else {
        // Fallback to user_id if workspace_id column exists
        query = query.eq("user_id", user.id);
      }

      query = query.in("provider", ["gmail", "outlook"]);

      const { data, error } = await query;

      if (error) {
        toast.error("Failed to load accounts");
        return;
      }

      setAccounts(
        (data || []).map((acc) => ({
          id: acc.id,
          email: acc.email || acc.email_address || "",
          email_address: acc.email_address,
          provider: acc.provider,
          domain: acc.domain,
          last_risk_score: acc.last_risk_score,
          last_risk_reason: acc.last_risk_reason,
          last_risk_checked_at: acc.last_risk_checked_at,
          suggested_daily_limit: acc.suggested_daily_limit,
        }))
      );
    } catch (error: any) {
      toast.error(error.message || "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">Loading warmup settings...</p>
        </CardContent>
      </Card>
    );
  }

  if (accounts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mailbox Warmup</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No connected mailboxes found. Connect a Gmail or Outlook account to enable warmup.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mailbox Warmup & Deliverability</CardTitle>
        <p className="text-sm text-muted-foreground mt-2">
          Check your email setup for spam risk and configure warmup settings to improve deliverability.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="warmup-check" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="warmup-check">Warmup Check</TabsTrigger>
            <TabsTrigger value="warmup-settings">Warmup Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="warmup-check" className="space-y-4 mt-4">
            {accounts.map((account) => (
              <WarmupCheckCard key={account.id} account={account} />
            ))}
          </TabsContent>
          <TabsContent value="warmup-settings" className="space-y-4 mt-4">
            {accounts.map((account) => (
              <WarmupSettingsCard key={account.id} mailbox={account} />
            ))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

