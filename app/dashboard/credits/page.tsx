"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClientComponentClient } from "@supabase/ssr";

export default function CreditsPage() {
  const [credits, setCredits] = useState<number>(0);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const load = async () => {
      // Get workspace_id
      let wsId = workspaceId;
      if (!wsId) {
        // Try localStorage
        const wsFromStorage = typeof window !== "undefined" 
          ? localStorage.getItem('active_workspace') 
          : null;
        
        if (wsFromStorage) {
          wsId = wsFromStorage;
        } else {
          // Get user's first workspace
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data } = await supabase
              .from('workspace_members')
              .select('workspace_id')
              .eq('user_id', user.id)
              .limit(1)
              .maybeSingle();
            
            if (data) {
              wsId = data.workspace_id;
            }
          }
        }
      }

      if (!wsId) {
        setLoading(false);
        return;
      }

      setWorkspaceId(wsId);

      // Fetch credits balance
      try {
        const res = await fetch("/api/billing/credits/balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: wsId }),
        });
        const json = await res.json();
        if (res.ok) {
          setCredits(json.credits ?? 0);
        }
      } catch (error) {
        console.error("Failed to load credits:", error);
      }

      // Fetch recent transactions
      try {
        const { data: txData } = await supabase
          .from("credit_transactions")
          .select("*")
          .eq("workspace_id", wsId)
          .order("created_at", { ascending: false })
          .limit(20);
        
        if (txData) {
          setTransactions(txData);
        }
      } catch (error) {
        console.error("Failed to load transactions:", error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [supabase, workspaceId]);

  const buy = async (priceId: string) => {
    if (!workspaceId) {
      alert("Please select a workspace first");
      return;
    }

    try {
      const res = await fetch("/api/billing/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, priceId }),
      });
      const json = await res.json();
      if (res.ok && json.url) {
        window.location.href = json.url;
      } else {
        alert(json.error || "Failed to create checkout session");
      }
    } catch (error) {
      console.error("Failed to create checkout:", error);
      alert("Failed to create checkout session");
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm">Loading credits...</div>
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="p-6">
        <div className="text-red-600">Error: No workspace found. Please create a workspace first.</div>
      </div>
    );
  }

  const smallPriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_SMALL || "";
  const mediumPriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_MEDIUM || "";
  const largePriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_LARGE || "";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Credits Wallet</h1>
        <p className="text-gray-600 mt-1">Purchase credits to use for extra sends, AI scans, and more</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Credits Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold">{credits.toLocaleString()}</div>
          <p className="text-sm text-gray-500 mt-2">
            Credits are used for: extra sends beyond plan (2 credits), AI reply scans (1 credit), enrichment boosts, and more
          </p>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-4">Purchase Credits</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">500 Credits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-2xl font-bold">$9.99</div>
              <Button 
                onClick={() => buy(smallPriceId)} 
                className="w-full"
                disabled={!smallPriceId}
              >
                Buy Now
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">2,000 Credits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-2xl font-bold">$29.99</div>
              <Button 
                onClick={() => buy(mediumPriceId)} 
                className="w-full"
                disabled={!mediumPriceId}
              >
                Buy Now
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">10,000 Credits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-2xl font-bold">$99.99</div>
              <Button 
                onClick={() => buy(largePriceId)} 
                className="w-full"
                disabled={!largePriceId}
              >
                Buy Now
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {transactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {transactions.map((tx) => (
                <div 
                  key={tx.id} 
                  className="flex justify-between items-center py-2 border-b last:border-0"
                >
                  <div>
                    <div className="font-medium">{tx.reason}</div>
                    <div className="text-sm text-gray-500">
                      {new Date(tx.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className={`font-bold ${tx.delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.delta > 0 ? '+' : ''}{tx.delta.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}








