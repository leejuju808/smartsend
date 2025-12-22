"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

type SegmentPerf = {
  segment: string;
  sends: number;
  best_tone: string;
  score: number;
  open_rate: number;
  positive_share: number;
  meeting_share: number;
  tone_perf: Array<{
    tone: string;
    sends: number;
    open_rate: number;
    positive_share: number;
    meeting_share: number;
  }>;
  tone_overrides?: Record<string, boolean>;
};

export default function SegmentsPage({ params }: { params: { id: string } }) {
  const [segments, setSegments] = useState<SegmentPerf[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<SegmentPerf | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadSegments();
  }, [params.id]);

  async function loadSegments() {
    setLoading(true);
    try {
      // Aggregate segment performance
      const { data, error } = await supabase
        .from("tone_perf_by_segment_30d")
        .select("*")
        .eq("campaign_id", params.id);

      if (error) throw error;

      // Group by segment and calculate best tone
      const segmentMap = new Map<string, SegmentPerf>();
      
      (data || []).forEach((row: any) => {
        const seg = row.segment || "unknown";
        if (!segmentMap.has(seg)) {
          segmentMap.set(seg, {
            segment: seg,
            sends: 0,
            best_tone: "",
            score: 0,
            open_rate: 0,
            positive_share: 0,
            meeting_share: 0,
            tone_perf: [],
          });
        }
        const perf = segmentMap.get(seg)!;
        perf.sends += Number(row.sends || 0);
        perf.tone_perf.push({
          tone: row.tone,
          sends: Number(row.sends || 0),
          open_rate: Number(row.open_rate || 0),
          positive_share: Number(row.positive_share || 0),
          meeting_share: Number(row.meeting_share || 0),
        });
      });

      // Calculate best tone per segment
      segmentMap.forEach((perf) => {
        if (perf.tone_perf.length > 0) {
          // Score = 0.2*open_rate + 0.6*positive_share + 0.2*meeting_share
          const scored = perf.tone_perf.map((t) => ({
            ...t,
            score: 0.2 * t.open_rate + 0.6 * t.positive_share + 0.2 * t.meeting_share,
          }));
          const best = scored.sort((a, b) => b.score - a.score)[0];
          perf.best_tone = best.tone;
          perf.score = best.score;
          perf.open_rate = best.open_rate;
          perf.positive_share = best.positive_share;
          perf.meeting_share = best.meeting_share;
        }
      });

      // Load tone overrides
      const { data: overrides } = await supabase
        .from("segment_tone_overrides")
        .select("segment, tone, allowed")
        .eq("campaign_id", params.id);

      const overrideMap = new Map<string, Record<string, boolean>>();
      (overrides || []).forEach((o: any) => {
        if (!overrideMap.has(o.segment)) {
          overrideMap.set(o.segment, {});
        }
        overrideMap.get(o.segment)![o.tone] = o.allowed;
      });

      segmentMap.forEach((perf) => {
        perf.tone_overrides = overrideMap.get(perf.segment) || {};
      });

      setSegments(Array.from(segmentMap.values()).sort((a, b) => b.sends - a.sends));
    } catch (err) {
      console.error("Error loading segments:", err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleToneOverride(segment: string, tone: string, allowed: boolean) {
    try {
      const { error } = await supabase
        .from("segment_tone_overrides")
        .upsert(
          {
            campaign_id: params.id,
            segment,
            tone,
            allowed,
          },
          { onConflict: "campaign_id,segment,tone" }
        );

      if (error) throw error;
      await loadSegments();
    } catch (err) {
      console.error("Error toggling tone override:", err);
    }
  }

  if (loading) {
    return <div className="p-6">Loading segments...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Segment Performance</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Segments (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Segment</TableHead>
                <TableHead>Sends</TableHead>
                <TableHead>Best Tone</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Opens %</TableHead>
                <TableHead>Pos/Reply %</TableHead>
                <TableHead>Meet/Reply %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {segments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No segment data available
                  </TableCell>
                </TableRow>
              ) : (
                segments.map((seg) => (
                  <TableRow
                    key={seg.segment}
                    className="cursor-pointer"
                    onClick={() => setSelectedSegment(seg)}
                  >
                    <TableCell className="font-medium">{seg.segment || "unknown"}</TableCell>
                    <TableCell>{seg.sends}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{seg.best_tone}</Badge>
                    </TableCell>
                    <TableCell>{(seg.score * 100).toFixed(1)}%</TableCell>
                    <TableCell>{(seg.open_rate * 100).toFixed(1)}%</TableCell>
                    <TableCell>{(seg.positive_share * 100).toFixed(1)}%</TableCell>
                    <TableCell>{(seg.meeting_share * 100).toFixed(1)}%</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedSegment && (
        <Dialog open={!!selectedSegment} onOpenChange={() => setSelectedSegment(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Segment: {selectedSegment.segment}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">Performance by Tone</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={selectedSegment.tone_perf}>
                    <XAxis dataKey="tone" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="open_rate" fill="#8884d8" name="Open Rate" />
                    <Bar dataKey="positive_share" fill="#82ca9d" name="Positive Share" />
                    <Bar dataKey="meeting_share" fill="#ffc658" name="Meeting Share" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <h3 className="text-sm font-medium mb-2">Tone Controls</h3>
                <div className="flex flex-wrap gap-2">
                  {["formal", "casual", "humorous", "assertive"].map((tone) => {
                    const perf = selectedSegment.tone_perf.find((t) => t.tone === tone);
                    const isAllowed = selectedSegment.tone_overrides?.[tone] !== false;
                    return (
                      <div key={tone} className="flex items-center gap-2 border rounded p-2">
                        <span className="text-sm font-medium capitalize">{tone}</span>
                        <Switch
                          checked={isAllowed}
                          onCheckedChange={(checked) =>
                            toggleToneOverride(selectedSegment.segment, tone, checked)
                          }
                        />
                        <span className="text-sm">{perf ? `${(perf.open_rate * 100).toFixed(1)}% open` : "No data"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

