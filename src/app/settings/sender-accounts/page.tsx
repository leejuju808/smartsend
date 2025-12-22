"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SenderAccount = {
  id: string;
  org_id: string;
  provider: "gmail" | "outlook" | "smtp";
  email: string;
  display_name?: string;
  daily_cap: number;
  per_min_cap: number;
  warmup: boolean;
  is_active: boolean;
  cooldown_until?: string;
};

export default function SenderAccountsPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<SenderAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get org_id
      const { data: orgs } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (orgs?.org_id) {
        setOrgId(orgs.org_id);
        await loadAccounts(orgs.org_id);
      }
    })();
  }, []);

  async function loadAccounts(org_id: string) {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sender_accounts")
        .select("*")
        .eq("org_id", org_id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAccounts(data || []);
    } catch (error: any) {
      console.error("Failed to load accounts:", error);
      alert(error.message || "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }

  async function updateCap(accountId: string, field: "daily_cap" | "per_min_cap", value: number) {
    if (!orgId) return;
    try {
      const { error } = await supabase
        .from("sender_accounts")
        .update({ [field]: value })
        .eq("id", accountId)
        .eq("org_id", orgId);

      if (error) throw error;
      await loadAccounts(orgId);
    } catch (error: any) {
      alert(error.message || "Failed to update");
    }
  }

  async function toggleWarmup(accountId: string, current: boolean) {
    if (!orgId) return;
    try {
      const { error } = await supabase
        .from("sender_accounts")
        .update({ warmup: !current })
        .eq("id", accountId)
        .eq("org_id", orgId);

      if (error) throw error;
      await loadAccounts(orgId);
    } catch (error: any) {
      alert(error.message || "Failed to update");
    }
  }

  async function toggleActive(accountId: string, current: boolean) {
    if (!orgId) return;
    try {
      const { error } = await supabase
        .from("sender_accounts")
        .update({ is_active: !current })
        .eq("id", accountId)
        .eq("org_id", orgId);

      if (error) throw error;
      await loadAccounts(orgId);
    } catch (error: any) {
      alert(error.message || "Failed to update");
    }
  }

  async function testSend(accountId: string) {
    if (!testEmail.trim()) {
      alert("Please enter your email address");
      return;
    }

    setTesting(accountId);
    try {
      const res = await fetch("/api/sender-accounts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_id: accountId,
          to_email: testEmail.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        alert("Test email sent! Check your inbox.");
      } else {
        alert(data.error || "Failed to send test email");
      }
    } catch (error: any) {
      alert(error.message || "Failed to send test email");
    } finally {
      setTesting(null);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Sender Accounts</h1>
      <p className="text-muted-foreground">
        Manage connected email accounts with caps and throttling settings.
      </p>

      <div className="space-y-4">
        {accounts.map((acc) => (
          <div key={acc.id} className="rounded-lg border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{acc.display_name || acc.email}</div>
                <div className="text-sm text-muted-foreground">{acc.email}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Provider: {acc.provider}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={acc.is_active}
                    onChange={() => toggleActive(acc.id, acc.is_active)}
                    className="rounded"
                  />
                  <span className="text-sm">Active</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={acc.warmup}
                    onChange={() => toggleWarmup(acc.id, acc.warmup)}
                    className="rounded"
                  />
                  <span className="text-sm">Warmup</span>
                </label>
              </div>
            </div>

            {acc.cooldown_until && new Date(acc.cooldown_until) > new Date() && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm">
                ⚠️ Cooldown until {new Date(acc.cooldown_until).toLocaleString()}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Daily Cap</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type="number"
                    value={acc.daily_cap}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      updateCap(acc.id, "daily_cap", val);
                    }}
                    className="w-24"
                    min="1"
                  />
                  <span className="text-sm text-muted-foreground self-center">
                    emails/day {acc.warmup && <>(effective: {Math.ceil(acc.daily_cap * 0.4)})</>}
                  </span>
                </div>
              </div>
              <div>
                <Label>Per-Minute Cap</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type="number"
                    value={acc.per_min_cap}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      updateCap(acc.id, "per_min_cap", val);
                    }}
                    className="w-24"
                    min="1"
                  />
                  <span className="text-sm text-muted-foreground self-center">emails/min</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 items-center">
              <Input
                type="email"
                placeholder="Your email to test"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="max-w-xs"
              />
              <Button
                onClick={() => testSend(acc.id)}
                disabled={testing === acc.id}
                variant="outline"
              >
                {testing === acc.id ? "Sending..." : "Test Send"}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {accounts.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No sender accounts yet. Connect accounts via OAuth or SMTP configuration.
        </div>
      )}
    </div>
  );
}

