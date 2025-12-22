"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle, ArrowRight } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

interface DeliverabilityHealthWidgetProps {
  workspaceId: string;
}

interface AccountRisk {
  id: string;
  email_address: string;
  account_email: string;
  email: string;
  last_risk_score: number | null;
  suggested_daily_limit: number | null;
}

export function DeliverabilityHealthWidget({ workspaceId }: DeliverabilityHealthWidgetProps) {
  const [accounts, setAccounts] = React.useState<AccountRisk[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    loadAccounts();
  }, [workspaceId]);

  async function loadAccounts() {
    try {
      setLoading(true);
      const supabase = supabaseBrowser();

      const { data, error } = await supabase
        .from("connected_accounts")
        .select("id, email_address, account_email, email, last_risk_score, suggested_daily_limit")
        .eq("workspace_id", workspaceId)
        .in("provider", ["gmail", "outlook"])
        .order("last_risk_score", { ascending: true, nullsFirst: false })
        .limit(3);

      if (error) {
        console.error("Failed to load accounts:", error);
        return;
      }

      setAccounts(
        (data || []).map((acc) => ({
          id: acc.id,
          email_address: acc.email_address || "",
          account_email: acc.account_email || "",
          email: acc.email || "",
          last_risk_score: acc.last_risk_score,
          suggested_daily_limit: acc.suggested_daily_limit,
        }))
      );
    } catch (error) {
      console.error("Error loading accounts:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Deliverability Health</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (accounts.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Deliverability Health</CardTitle>
          <Link href="/settings/sending">
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              View All
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {accounts.map((account) => {
          const email = account.email_address || account.account_email || account.email;
          const score = account.last_risk_score;
          
          if (score === null || score === undefined) {
            return (
              <div key={account.id} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate flex-1">{email}</span>
                <Badge variant="outline" className="text-xs">Not checked</Badge>
              </div>
            );
          }

          const riskLevel = score < 40 ? "high" : score < 70 ? "medium" : "low";
          
          const variants = {
            low: { 
              variant: "default" as const, 
              icon: CheckCircle2, 
              label: "OK", 
              color: "text-green-600" 
            },
            medium: { 
              variant: "secondary" as const, 
              icon: AlertTriangle, 
              label: "Needs Fix", 
              color: "text-yellow-600" 
            },
            high: { 
              variant: "destructive" as const, 
              icon: XCircle, 
              label: "Dangerous", 
              color: "text-red-600" 
            },
          };

          const config = variants[riskLevel];
          const Icon = config.icon;

          return (
            <Link
              key={account.id}
              href="/settings/sending"
              className="flex items-center justify-between text-xs hover:bg-muted/50 p-1.5 rounded transition-colors"
            >
              <span className="text-muted-foreground truncate flex-1 mr-2">{email}</span>
              <div className="flex items-center gap-1.5">
                <span className={`font-medium ${config.color}`}>Risk {score}</span>
                <Badge variant={config.variant} className="text-xs flex items-center gap-0.5">
                  <Icon className="h-2.5 w-2.5" />
                  {config.label}
                </Badge>
              </div>
            </Link>
          );
        })}
        
        {accounts.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No sending accounts configured
          </p>
        )}
      </CardContent>
    </Card>
  );
}





























































