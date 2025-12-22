"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

export default function SendSettings({ workspaceId }: { workspaceId: string }) {
  const { toast } = useToast();
  const [hourly, setHourly] = useState(50);
  const [daily, setDaily] = useState(200);
  const [jmin, setJmin] = useState(500);
  const [jmax, setJmax] = useState(2500);
  const [loading, setLoading] = useState(false);

  // Load existing settings
  useEffect(() => {
    fetch("/api/send-settings/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.settings) {
          setHourly(data.settings.hourly_cap);
          setDaily(data.settings.daily_cap);
          setJmin(data.settings.jitter_ms_min);
          setJmax(data.settings.jitter_ms_max);
        }
      })
      .catch(console.error);
  }, [workspaceId]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/send-settings/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          hourly_cap: hourly,
          daily_cap: daily,
          jitter_ms_min: jmin,
          jitter_ms_max: jmax,
        }),
      });
      const j = await r.json();
      
      toast({
        title: j.ok ? "Saved" : "Error",
        description: j.ok ? "Limits updated." : j.message,
        variant: j.ok ? "default" : "destructive",
      });
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Sending Limits</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl">
        <div>
          <label className="text-sm text-muted-foreground">Hourly cap</label>
          <Input
            type="number"
            value={hourly}
            onChange={(e) => setHourly(+e.target.value)}
            placeholder="Hourly cap"
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Daily cap</label>
          <Input
            type="number"
            value={daily}
            onChange={(e) => setDaily(+e.target.value)}
            placeholder="Daily cap"
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Jitter min (ms)</label>
          <Input
            type="number"
            value={jmin}
            onChange={(e) => setJmin(+e.target.value)}
            placeholder="Jitter min (ms)"
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Jitter max (ms)</label>
          <Input
            type="number"
            value={jmax}
            onChange={(e) => setJmax(+e.target.value)}
            placeholder="Jitter max (ms)"
          />
        </div>
      </div>
      
      <div className="text-sm text-muted-foreground">
        Current settings: {hourly}/hr • {daily}/day • Jitter: {jmin/1000}s–{jmax/1000}s
      </div>
      
      <Button onClick={handleSave} disabled={loading}>
        {loading ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
