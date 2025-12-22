"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

type FunnelItem = { stage: "sent"|"opens"|"clicks"|"replies"; count: number };
type StepItem = { step_no: number; sent: number; opens: number; clicks: number; replies: number; open_rate: number; click_rate: number; reply_rate: number };
type VariantItem = { step_no: number; variant_id: string|null; variant_name: string|null; sent: number; opens: number; clicks: number; replies: number; open_rate: number; click_rate: number; reply_rate: number };

export function CampaignFunnel({ campaignId }: { campaignId: string }) {
  const [range, setRange] = useState<"7d"|"30d">("7d");
  const [data, setData] = useState<{ funnel:FunnelItem[]; steps:StepItem[]; variants:VariantItem[] }>({ funnel:[], steps:[], variants:[] });
  const [showVariants, setShowVariants] = useState(false);

  const apiUrl = useMemo(() => `/api/campaigns/${campaignId}/funnel?range=${range}`, [campaignId, range]);

  useEffect(() => {
    (async () => {
      const res = await fetch(apiUrl, { cache: "no-store" });
      const json = await res.json();
      setData({ funnel: json.funnel || [], steps: json.steps || [], variants: json.variants || [] });
    })();
  }, [apiUrl]);

  const funnel = useMemo(() => {
    const order = ["sent","opens","clicks","replies"] as const;
    const m = Object.fromEntries((data.funnel||[]).map((x:any)=>[x.stage, x.count]));
    return order.map(s => ({ stage: s, count: m[s] ?? 0 }));
  }, [data]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {/* Controls */}
      <Card className="xl:col-span-3">
        <CardContent className="flex items-center gap-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Range</span>
            <Select value={range} onValueChange={(v:any)=>setRange(v)}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Show variants</span>
            <Switch checked={showVariants} onCheckedChange={setShowVariants} />
          </div>
        </CardContent>
      </Card>

      {/* Funnel */}
      <Card className="xl:col-span-1">
        <CardHeader className="pb-2"><CardTitle>Funnel</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnel}>
              <XAxis dataKey="stage" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">Sends → Opens → Clicks → Replies</p>
        </CardContent>
      </Card>

      {/* Per-step */}
      <Card className="xl:col-span-2">
        <CardHeader className="pb-2"><CardTitle>Per-Step Breakdown</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {!showVariants ? (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-2 pr-4">Step</th><th className="py-2 pr-4">Sent</th><th className="py-2 pr-4">Opens</th><th className="py-2 pr-4">Clicks</th><th className="py-2 pr-4">Replies</th><th className="py-2 pr-4">Open %</th><th className="py-2 pr-4">Click %</th><th className="py-2 pr-4">Reply %</th></tr>
              </thead>
              <tbody>
                {data.steps.map(s => (
                  <tr key={s.step_no} className="border-t">
                    <td className="py-2 pr-4 font-medium">Step {s.step_no}</td>
                    <td className="py-2 pr-4 tabular-nums">{s.sent}</td>
                    <td className="py-2 pr-4 tabular-nums">{s.opens}</td>
                    <td className="py-2 pr-4 tabular-nums">{s.clicks}</td>
                    <td className="py-2 pr-4 tabular-nums">{s.replies}</td>
                    <td className="py-2 pr-4 tabular-nums">{(s.open_rate*100).toFixed(1)}%</td>
                    <td className="py-2 pr-4 tabular-nums">{(s.click_rate*100).toFixed(1)}%</td>
                    <td className="py-2 pr-4 tabular-nums">{(s.reply_rate*100).toFixed(1)}%</td>
                  </tr>
                ))}
                {data.steps.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No data in range.</td></tr>}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-2 pr-4">Step</th><th className="py-2 pr-4">Variant</th><th className="py-2 pr-4">Sent</th><th className="py-2 pr-4">Opens</th><th className="py-2 pr-4">Clicks</th><th className="py-2 pr-4">Replies</th><th className="py-2 pr-4">Open %</th><th className="py-2 pr-4">Click %</th><th className="py-2 pr-4">Reply %</th></tr>
              </thead>
              <tbody>
                {data.variants.map(v => (
                  <tr key={`${v.step_no}-${v.variant_id || 'none'}`} className="border-t">
                    <td className="py-2 pr-4 font-medium">Step {v.step_no}</td>
                    <td className="py-2 pr-4">{v.variant_name || "—"}</td>
                    <td className="py-2 pr-4 tabular-nums">{v.sent}</td>
                    <td className="py-2 pr-4 tabular-nums">{v.opens}</td>
                    <td className="py-2 pr-4 tabular-nums">{v.clicks}</td>
                    <td className="py-2 pr-4 tabular-nums">{v.replies}</td>
                    <td className="py-2 pr-4 tabular-nums">{(v.open_rate*100).toFixed(1)}%</td>
                    <td className="py-2 pr-4 tabular-nums">{(v.click_rate*100).toFixed(1)}%</td>
                    <td className="py-2 pr-4 tabular-nums">{(v.reply_rate*100).toFixed(1)}%</td>
                  </tr>
                ))}
                {data.variants.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">No variant data in range.</td></tr>}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
