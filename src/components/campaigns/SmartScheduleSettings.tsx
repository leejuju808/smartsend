"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Clock, Zap, TrendingUp, MapPin } from "lucide-react";

interface SmartScheduleSettingsProps {
  campaignId: string;
  workspaceId: string;
  onScheduleCreated?: () => void;
}

export function SmartScheduleSettings({
  campaignId,
  workspaceId,
  onScheduleCreated,
}: SmartScheduleSettingsProps) {
  const { toast } = useToast();
  const [scheduleType, setScheduleType] = useState<"specific_time" | "smart_send" | "interval">("smart_send");
  const [saving, setSaving] = useState(false);
  const [recommendations, setRecommendations] = useState<any>(null);
  const [hotspots, setHotspots] = useState<any[]>([]);

  // Specific Time Mode
  const [sendTime, setSendTime] = useState<string>("");
  const [sendDate, setSendDate] = useState<string>("");

  // Interval Mode
  const [intervalMinutes, setIntervalMinutes] = useState<number>(15);
  const [emailsPerHour, setEmailsPerHour] = useState<number>(50);

  // Smart Send Mode
  const [smartSendMinHour, setSmartSendMinHour] = useState<number>(9);
  const [smartSendMaxHour, setSmartSendMaxHour] = useState<number>(17);
  const [smartSendDays, setSmartSendDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [waveSize, setWaveSize] = useState<number>(50);
  const [waveIntervalMinutes, setWaveIntervalMinutes] = useState<number>(30);
  const [enableDomainStaggering, setEnableDomainStaggering] = useState<boolean>(false);
  const [enableWeatherScheduling, setEnableWeatherScheduling] = useState<boolean>(false);

  // Date Range
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  useEffect(() => {
    // Load recommendations
    loadRecommendations();
  }, [workspaceId]);

  const loadRecommendations = async () => {
    try {
      const res = await fetch(
        `/api/smart-send/recommendations?workspaceId=${workspaceId}`
      );
      const data = await res.json();
      if (res.ok) {
        setRecommendations(data);
        setHotspots(data.hotspots || []);
      }
    } catch (error) {
      console.error("Error loading recommendations:", error);
    }
  };

  const toggleDay = (day: number) => {
    setSmartSendDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort()
    );
  };

  const handleSchedule = async () => {
    setSaving(true);
    try {
      const payload: any = {
        scheduleType,
        startDate: startDate || new Date().toISOString().split("T")[0],
        endDate: endDate || null,
        smartSendEnabled: scheduleType === "smart_send",
        smartSendMinHour,
        smartSendMaxHour,
        smartSendDaysOfWeek: smartSendDays,
        waveSize,
        waveIntervalMinutes,
        enableDomainStaggering,
        enableWeatherScheduling,
      };

      if (scheduleType === "specific_time") {
        if (!sendDate || !sendTime) {
          toast({
            title: "Missing fields",
            description: "Please select both date and time",
            variant: "destructive",
          });
          setSaving(false);
          return;
        }
        payload.sendTime = sendTime;
      }

      if (scheduleType === "interval") {
        payload.intervalMinutes = intervalMinutes;
        payload.emailsPerHour = emailsPerHour;
      }

      const res = await fetch(`/api/campaigns/${campaignId}/schedule-smart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to schedule campaign");
      }

      toast({
        title: "Campaign scheduled",
        description: `Schedule created with ${json.wavesCreated || 1} wave(s)`,
      });

      onScheduleCreated?.();
    } catch (error: any) {
      toast({
        title: "Schedule error",
        description: error.message || "Failed to create schedule",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Campaign Scheduler</h2>
        <p className="text-muted-foreground">
          Choose how and when to send your campaign emails
        </p>
      </div>

      <Tabs value={scheduleType} onValueChange={(v) => setScheduleType(v as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="smart_send">
            <Sparkles className="h-4 w-4 mr-2" />
            Smart Send
          </TabsTrigger>
          <TabsTrigger value="specific_time">
            <Clock className="h-4 w-4 mr-2" />
            Specific Time
          </TabsTrigger>
          <TabsTrigger value="interval">
            <Zap className="h-4 w-4 mr-2" />
            Interval
          </TabsTrigger>
        </TabsList>

        {/* Smart Send Mode */}
        <TabsContent value="smart_send" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Smart Send Settings
              </CardTitle>
              <CardDescription>
                AI-powered timing that learns when your leads are most likely to engage
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Best Time Window */}
              {recommendations && recommendations.recommendations?.length > 0 && (
                <div className="rounded-lg border bg-muted/50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span className="font-medium">Best Time Window</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {recommendations.recommendations[0] && (
                      <div>
                        {dayNames[recommendations.recommendations[0].dayOfWeek]} at{" "}
                        {recommendations.recommendations[0].hour}:00
                        <span className="ml-2 text-xs">
                          ({Math.round(recommendations.recommendations[0].openRate * 100)}% open rate)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Time Window */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Start Hour</label>
                  <Input
                    type="number"
                    min="0"
                    max="23"
                    value={smartSendMinHour}
                    onChange={(e) => setSmartSendMinHour(parseInt(e.target.value))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">End Hour</label>
                  <Input
                    type="number"
                    min="0"
                    max="23"
                    value={smartSendMaxHour}
                    onChange={(e) => setSmartSendMaxHour(parseInt(e.target.value))}
                  />
                </div>
              </div>

              {/* Days of Week */}
              <div>
                <label className="text-sm font-medium mb-2 block">Days of Week</label>
                <div className="grid grid-cols-7 gap-2">
                  {dayNames.map((day, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleDay(idx)}
                      className={`rounded-lg border p-2 text-sm ${
                        smartSendDays.includes(idx)
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              {/* Wave Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Wave Size</label>
                  <Input
                    type="number"
                    min="1"
                    value={waveSize}
                    onChange={(e) => setWaveSize(parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Emails per wave
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Wave Interval</label>
                  <Input
                    type="number"
                    min="1"
                    value={waveIntervalMinutes}
                    onChange={(e) => setWaveIntervalMinutes(parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Minutes between waves
                  </p>
                </div>
              </div>

              {/* ZIP Hotspots */}
              {hotspots.length > 0 && (
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-4 w-4" />
                    <span className="font-medium">Top Performing ZIP Codes</span>
                  </div>
                  <div className="space-y-1 text-sm">
                    {hotspots.slice(0, 5).map((hotspot, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>{hotspot.zipcode}</span>
                        <span className="text-muted-foreground">
                          {Math.round(hotspot.openRate * 100)}% open
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Advanced Options */}
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium">Domain Staggering</label>
                    <p className="text-xs text-muted-foreground">
                      Rotate between multiple domains to protect deliverability
                    </p>
                  </div>
                  <Switch
                    checked={enableDomainStaggering}
                    onCheckedChange={setEnableDomainStaggering}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium">Weather-Based Scheduling</label>
                    <p className="text-xs text-muted-foreground">
                      Prioritize ZIP codes during weather events
                    </p>
                  </div>
                  <Switch
                    checked={enableWeatherScheduling}
                    onCheckedChange={setEnableWeatherScheduling}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Specific Time Mode */}
        <TabsContent value="specific_time" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Specific Time
              </CardTitle>
              <CardDescription>
                Send all emails at a specific date and time
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Date</label>
                <Input
                  type="date"
                  value={sendDate}
                  onChange={(e) => setSendDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Time</label>
                <Input
                  type="time"
                  value={sendTime}
                  onChange={(e) => setSendTime(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Interval Mode */}
        <TabsContent value="interval" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Interval Sending
              </CardTitle>
              <CardDescription>
                Send emails at regular intervals to protect deliverability
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    Interval (minutes)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={intervalMinutes}
                    onChange={(e) => setIntervalMinutes(parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Send 1 email every X minutes
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    Emails per Hour
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={emailsPerHour}
                    onChange={(e) => setEmailsPerHour(parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Alternative: send X emails per hour
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Date Range */}
      <Card>
        <CardHeader>
          <CardTitle>Date Range</CardTitle>
          <CardDescription>Optional: limit sending to a date range</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || new Date().toISOString().split("T")[0]}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end">
        <Button onClick={handleSchedule} disabled={saving} size="lg">
          {saving ? "Scheduling..." : "Create Schedule"}
        </Button>
      </div>
    </div>
  );
}



























