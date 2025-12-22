"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { getBrowserSupabase } from "@/utils/supabase/client";

export function AddToCampaignModal({
  open, onOpenChange, userId, jobId
}: { open:boolean; onOpenChange:(v:boolean)=>void; userId:string; jobId:string }) {
  const [campaigns, setCampaigns] = useState<Array<{id:string; name:string}>>([]);
  const [campaignId, setCampaignId] = useState<string>("");
  const [when, setWhen] = useState<"now"|"tomorrow_9"|"monday_9">("now");
  const [includeJitter, setIncludeJitter] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{added:number; enqueued:number} | null>(null);
  const supabase = getBrowserSupabase();

  useEffect(() => {
    if (!open) return;
    (async () => {
      // Fetch user campaigns (replace with your real query)
      const res = await fetch("/api/my-campaigns");
      const j = await res.json();
      setCampaigns(j.rows ?? []);
    })();
  }, [open]);

  function computeBase(): string {
    const d = new Date();
    if (when === "tomorrow_9") {
      d.setDate(d.getDate() + 1); d.setHours(9,0,0,0);
    } else if (when === "monday_9") {
      const day = d.getDay(); const add = (8 - day) % 7 || 7; // next Monday
      d.setDate(d.getDate() + add); d.setHours(9,0,0,0);
    }
    return d.toISOString();
  }

  async function getAuthHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      "Authorization": `Bearer ${session?.access_token || ""}`,
      "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
      "Content-Type": "application/json",
    };
  }

  async function run() {
    if (!campaignId) return;
    setLoading(true);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      const headers = await getAuthHeaders();
      const res = await fetch(`${supabaseUrl}/functions/v1/add-to-campaign`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          campaign_id: campaignId,
          user_id: userId,
          job_id: jobId,
          base: computeBase(),
          include_jitter: includeJitter
        })
      });
      const j = await res.json();
      if (j.ok) {
        setResult({ added: j.added, enqueued: j.enqueued });
      } else {
        console.error("Failed to add to campaign:", j.error);
      }
    } catch (e) {
      console.error("Failed to add to campaign:", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add imported leads to a campaign</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm">Choose campaign</div>
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger><SelectValue placeholder="Select campaign" /></SelectTrigger>
            <SelectContent>
              {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Card className="p-3 space-y-2">
            <div className="text-sm font-medium">Schedule Step 1</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Button variant={when==='now'?'default':'outline'} onClick={()=>setWhen('now')}>Now</Button>
              <Button variant={when==='tomorrow_9'?'default':'outline'} onClick={()=>setWhen('tomorrow_9')}>Tomorrow 9am</Button>
              <Button variant={when==='monday_9'?'default':'outline'} onClick={()=>setWhen('monday_9')}>Next Mon 9am</Button>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeJitter} onChange={e=>setIncludeJitter(e.target.checked)} />
              Add jitter window (human-like pacing)
            </label>
          </Card>

          {result && (
            <div className="text-sm">
              Attached: <b>{result.added}</b> · Enqueued Step 1: <b>{result.enqueued}</b>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={()=>onOpenChange(false)}>Close</Button>
          <Button onClick={run} disabled={!campaignId || loading}>{loading ? "Working…" : "Add & Enqueue"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

