"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Mail, Users, FileText, Calendar, Clock } from "lucide-react";
import { toast } from "sonner";

interface Step6ReviewProps {
  onNext: (data: {
    schedule: {
      immediate: boolean;
      startDate?: string;
      timeWindow?: { start: string; end: string };
    };
    dailySendCap?: number;
  }) => void;
  onBack: () => void;
  state: any;
}

export function Step6Review({ onNext, onBack, state }: Step6ReviewProps) {
  const [schedule, setSchedule] = useState({
    immediate: true,
    startDate: new Date().toISOString().split("T")[0],
    timeWindow: { start: "09:00", end: "17:00" },
  });
  const [dailySendCap, setDailySendCap] = useState(50);
  const [identity, setIdentity] = useState<any>(null);
  const [template, setTemplate] = useState<any>(null);

  useEffect(() => {
    loadDetails();
  }, []);

  const loadDetails = async () => {
    // Load identity details
    if (state.data.sendingIdentityId) {
      try {
        const res = await fetch("/api/settings/sending-identities");
        if (res.ok) {
          const data = await res.json();
          const found = data.identities?.find((id: any) => id.id === state.data.sendingIdentityId);
          if (found) setIdentity(found);
        }
      } catch (error) {
        // Silently fail
      }
    }

    // Load template details
    if (state.data.templateId) {
      try {
        const res = await fetch(`/api/templates/campaigns/${state.data.templateId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.template) setTemplate(data.template);
        }
      } catch (error) {
        // Silently fail
      }
    }
  };

  const handleNext = () => {
    onNext({
      schedule,
      dailySendCap,
    });
  };

  const contactCount = state.data.contacts?.length || 0;
  const estimatedTime = Math.ceil(contactCount / dailySendCap);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Review & Settings</h2>
        <p className="text-gray-600 mt-2">
          Review your campaign settings and adjust as needed
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Campaign Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium">Sending Identity</p>
                <p className="text-sm text-muted-foreground">
                  {identity?.email_address || "Not set"}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium">Contacts</p>
                <p className="text-sm text-muted-foreground">
                  {contactCount} homeowner contacts added
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium">Template</p>
                <p className="text-sm text-muted-foreground">
                  {template?.title || "Not set"} ({template?.steps?.length || 0} steps)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Send Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Schedule</Label>
              <Select
                value={schedule.immediate ? "immediate" : "scheduled"}
                onValueChange={(value) =>
                  setSchedule({ ...schedule, immediate: value === "immediate" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="immediate">Start immediately</SelectItem>
                  <SelectItem value="scheduled">Schedule for later</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!schedule.immediate && (
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={schedule.startDate}
                  onChange={(e) =>
                    setSchedule({ ...schedule, startDate: e.target.value })
                  }
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={schedule.timeWindow.start}
                  onChange={(e) =>
                    setSchedule({
                      ...schedule,
                      timeWindow: { ...schedule.timeWindow, start: e.target.value },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={schedule.timeWindow.end}
                  onChange={(e) =>
                    setSchedule({
                      ...schedule,
                      timeWindow: { ...schedule.timeWindow, end: e.target.value },
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Daily Send Limit</Label>
              <Input
                type="number"
                value={dailySendCap}
                onChange={(e) => setDailySendCap(parseInt(e.target.value) || 50)}
                min={1}
                max={identity?.daily_send_limit || 500}
              />
              <p className="text-xs text-muted-foreground">
                Max: {identity?.daily_send_limit || 500} emails/day
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Estimated Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Estimated Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="font-medium">
                First batch: {schedule.immediate ? "Today" : schedule.startDate} at {schedule.timeWindow.start}
              </p>
              <p className="text-sm text-muted-foreground">
                Estimated time to send all contacts: {estimatedTime} day{estimatedTime !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between pt-4">
        <Button onClick={onBack} variant="outline">
          Back
        </Button>
        <Button onClick={handleNext}>
          Continue to Launch
        </Button>
      </div>
    </div>
  );
}




























































