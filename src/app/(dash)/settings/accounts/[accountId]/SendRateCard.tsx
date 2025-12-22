"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type RateBucket = {
  capacity: number;
  refill_per_sec: number;
  tokens: number;
  last_refill_at: string;
};

export function SendRateCard({
  accountId,
  provider,
}: {
  accountId: string;
  provider: string;
}) {
  const supabase = createClientComponentClient();
  const [bucket, setBucket] = React.useState<RateBucket | null>(null);
  const [capacity, setCapacity] = React.useState<number>(100);
  const [refillPerSec, setRefillPerSec] = React.useState<number>(1);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [tokens, setTokens] = React.useState<number>(0);
  const [lastRefill, setLastRefill] = React.useState<string | null>(null);

  // Fetch bucket state
  React.useEffect(() => {
    loadBucket();
  }, [accountId, provider]);

  // Refresh tokens every second to show live updates
  React.useEffect(() => {
    if (!bucket || !lastRefill) return;
    const interval = setInterval(() => {
      updateTokenEstimate();
    }, 1000);
    return () => clearInterval(interval);
  }, [bucket, lastRefill, capacity, refillPerSec]);

  async function loadBucket() {
    try {
      const { data, error } = await supabase
        .from("send_rate_buckets")
        .select("capacity, refill_per_sec, tokens, last_refill_at")
        .eq("account_id", accountId)
        .eq("provider", provider)
        .maybeSingle();

      if (error) {
        console.error("Error loading bucket:", error);
        toast.error("Failed to load rate settings");
        return;
      }

      if (data) {
        setBucket(data);
        setCapacity(data.capacity);
        setRefillPerSec(data.refill_per_sec);
        setTokens(data.tokens);
        setLastRefill(data.last_refill_at);
      } else {
        // Use defaults if bucket doesn't exist yet
        const defaults = provider === "gmail" 
          ? { capacity: 100, refill_per_sec: 2, tokens: 100 }
          : { capacity: 60, refill_per_sec: 1, tokens: 60 };
        setCapacity(defaults.capacity);
        setRefillPerSec(defaults.refill_per_sec);
        setTokens(defaults.tokens);
      }
    } catch (e) {
      console.error("Load bucket failed", e);
      toast.error("Failed to load rate settings");
    } finally {
      setLoading(false);
    }
  }

  function updateTokenEstimate() {
    if (!bucket || !lastRefill) return;
    const now = new Date();
    const last = new Date(lastRefill);
    const elapsed = Math.max(0, (now.getTime() - last.getTime()) / 1000);
    const newTokens = Math.min(
      capacity,
      bucket.tokens + refillPerSec * elapsed
    );
    setTokens(newTokens);
  }

  React.useEffect(() => {
    updateTokenEstimate();
  }, [bucket, lastRefill, capacity, refillPerSec]);

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("send_rate_buckets")
        .upsert({
          account_id: accountId,
          provider: provider,
          capacity: capacity,
          refill_per_sec: refillPerSec,
          // Keep existing tokens, don't reset them
        }, {
          onConflict: "account_id,provider",
        });

      if (error) {
        console.error("Save failed", error);
        toast.error("Failed to save rate settings");
        return;
      }

      toast.success("Rate settings saved");
      await loadBucket();
    } catch (e) {
      console.error("Save failed", e);
      toast.error("Failed to save rate settings");
    } finally {
      setSaving(false);
    }
  }

  // Calculate time to next token
  const timeToNextToken = refillPerSec > 0 
    ? Math.max(0, (capacity - tokens) / refillPerSec)
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Send Rate</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="capacity">Capacity</Label>
          <Input
            id="capacity"
            type="number"
            min="1"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            disabled={loading || saving}
          />
          <p className="text-xs text-muted-foreground">
            Maximum tokens in bucket
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="refill">Refill / sec</Label>
          <Input
            id="refill"
            type="number"
            step="0.1"
            min="0.1"
            value={refillPerSec}
            onChange={(e) => setRefillPerSec(Number(e.target.value))}
            disabled={loading || saving}
          />
          <p className="text-xs text-muted-foreground">
            Tokens added each second
          </p>
        </div>

        <div className="rounded-md border p-3 bg-muted/50">
          <p className="text-sm font-medium mb-1">Current Status</p>
          <p className="text-sm text-muted-foreground">
            Current tokens: <span className="font-mono font-semibold">{tokens.toFixed(1)}</span>
            {timeToNextToken > 0 && (
              <>
                {" • "}
                Next token in ~<span className="font-mono">{timeToNextToken.toFixed(1)}s</span>
              </>
            )}
            {tokens >= capacity && (
              <span className="ml-2 text-green-600">(Full)</span>
            )}
          </p>
        </div>

        <Button onClick={save} disabled={loading || saving}>
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}

