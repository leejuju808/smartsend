"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DollarSign, Copy, Check } from "lucide-react";

export default function AffiliatePage() {
  const [aff, setAff] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const supabase = createClientComponentClient();

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("affiliates")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    setAff(data || null);
  }

  async function generate() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      alert("Please sign in to create a referral link");
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/affiliate/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: user.id }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate referral link");
      }

      const data = await res.json();
      setAff(data);
    } catch (error: any) {
      console.error("Error generating referral:", error);
      alert(error.message || "Failed to generate referral link");
    } finally {
      setGenerating(false);
      await load();
    }
  }

  async function copyLink() {
    if (!aff?.referral_url) return;
    await navigator.clipboard.writeText(aff.referral_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <DollarSign className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Affiliate Dashboard</h1>
      </div>

      {!aff ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground mb-4">
              Create your unique referral link and start earning 20% recurring commission on every referral who subscribes.
            </p>
            <Button onClick={generate} disabled={generating}>
              {generating ? "Creating…" : "Create My Referral Link"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div>
              <div className="text-sm text-muted-foreground mb-2">Your referral link</div>
              <div className="flex items-center gap-2">
                <div className="font-mono text-sm bg-muted p-2 rounded flex-1 overflow-x-auto">
                  {aff.referral_url}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyLink}
                  className="shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Total Referrals</div>
                <div className="text-2xl font-semibold">{aff.total_referrals || 0}</div>
              </div>
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Active Customers</div>
                <div className="text-2xl font-semibold">{aff.active_customers || 0}</div>
              </div>
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Earned</div>
                <div className="text-2xl font-semibold">${((aff.earned_cents || 0) / 100).toFixed(2)}</div>
              </div>
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Paid Out</div>
                <div className="text-2xl font-semibold">${((aff.paid_out_cents || 0) / 100).toFixed(2)}</div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>How it works:</strong> Share your referral link. When someone signs up and subscribes through your link, you'll earn 20% recurring commission. Commissions are calculated monthly and can be paid out via Stripe Connect or manual reports.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

