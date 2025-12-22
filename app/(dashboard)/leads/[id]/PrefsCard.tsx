"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/button";

export default function PrefsCard({ leadId }: { leadId: string }) {
  const [prefs, setPrefs] = useState<any>(null);
  async function load() {
    const r = await fetch(`/api/leads/${leadId}/prefs`);
    setPrefs((await r.json()).data);
  }
  useEffect(()=>{ load(); }, [leadId]);

  async function setUnsub(v: boolean) {
    await fetch(`/api/leads/${leadId}/prefs`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ unsubscribed: v }) });
    await load();
  }

  if (!prefs) return null;

  return (
    <Card>
      <CardHeader><CardTitle>Email Preferences</CardTitle></CardHeader>
      <CardContent className="flex items-center gap-2">
        <Button variant={prefs.unsubscribed ? "default" : "secondary"} onClick={()=>setUnsub(!prefs.unsubscribed)}>
          {prefs.unsubscribed ? "Unsubscribed" : "Subscribed"}
        </Button>
        <div className="text-sm text-muted-foreground">Freq: {prefs.frequency}</div>
        {prefs.paused_until ? <div className="text-sm">Snoozed until {prefs.paused_until}</div> : null}
      </CardContent>
    </Card>
  );
}

