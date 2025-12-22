"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, XCircle, Loader2, MapPin } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

interface SendWavesViewProps {
  campaignId: string;
  scheduleId?: string;
}

export function SendWavesView({ campaignId, scheduleId }: SendWavesViewProps) {
  const [waves, setWaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWaves();
  }, [campaignId, scheduleId]);

  const loadWaves = async () => {
    setLoading(true);
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      let query = supabase
        .from("send_waves")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("wave_number", { ascending: true });

      if (scheduleId) {
        query = query.eq("schedule_id", scheduleId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setWaves(data || []);
    } catch (error) {
      console.error("Error loading waves:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      pending: { variant: "secondary", icon: Clock },
      sending: { variant: "default", icon: Loader2 },
      sent: { variant: "default", icon: CheckCircle2 },
      cancelled: { variant: "destructive", icon: XCircle },
      failed: { variant: "destructive", icon: XCircle },
    };

    const config = variants[status] || variants.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
        </CardContent>
      </Card>
    );
  }

  if (waves.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          No send waves created yet
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Send Waves</h3>
        <p className="text-sm text-muted-foreground">
          Smart batches of emails scheduled for optimal engagement
        </p>
      </div>

      <div className="grid gap-4">
        {waves.map((wave) => (
          <Card key={wave.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  Wave {wave.wave_number}
                  {getStatusBadge(wave.status)}
                </CardTitle>
                <div className="text-sm text-muted-foreground">
                  {wave.total_recipients} recipients
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Send Time</div>
                  <div className="font-medium">{formatDate(wave.send_at)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Selected Time</div>
                  <div className="font-medium">
                    {dayNames[wave.selected_day_of_week]} at {wave.selected_hour}:00
                  </div>
                </div>
              </div>

              {wave.zipcode_distribution && (
                <div>
                  <div className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    ZIP Code Distribution
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(wave.zipcode_distribution)
                      .slice(0, 5)
                      .map(([zip, count]) => (
                        <Badge key={zip} variant="outline">
                          {zip}: {count}
                        </Badge>
                      ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4 pt-2 border-t">
                <div>
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div className="text-sm font-medium">{wave.total_recipients}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Sent</div>
                  <div className="text-sm font-medium text-green-600">
                    {wave.sent_count || 0}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                  <div className="text-sm font-medium text-red-600">
                    {wave.failed_count || 0}
                  </div>
                </div>
              </div>

              {wave.error_message && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-sm text-red-700">
                  {wave.error_message}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}



























