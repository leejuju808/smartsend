// Block 17400 — SmartSend Insurance Engine v1
// Adjuster Prep Kit Component
// Displays checklists, prep materials, and reminders for adjuster meetings

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { CheckCircle2, Circle, Upload, FileText, Camera, Drone, AlertCircle, Clock } from "lucide-react";
import { useState, useEffect } from "react";

interface AdjusterPrepKitProps {
  contactId: string;
  adjusterMeetingDate?: string | null;
  insuranceMetadata?: {
    adjuster_name?: string | null;
    adjuster_phone?: string | null;
    adjuster_email?: string | null;
    claim_number?: string | null;
    insurance_company?: string | null;
  } | null;
}

interface ChecklistItem {
  id: string;
  label: string;
  category: "photos" | "documents" | "measurements" | "other";
  required: boolean;
  completed: boolean;
}

export function AdjusterPrepKit({
  contactId,
  adjusterMeetingDate,
  insuranceMetadata,
}: AdjusterPrepKitProps) {
  const [checklist, setChecklist] = useState<ChecklistItem[]>([
    {
      id: "roof_damage_photos",
      label: "Roof damage photos (multiple angles)",
      category: "photos",
      required: true,
      completed: false,
    },
    {
      id: "shingle_lift",
      label: "Shingle lift photos",
      category: "photos",
      required: true,
      completed: false,
    },
    {
      id: "missing_shingles",
      label: "Missing shingles documentation",
      category: "photos",
      required: true,
      completed: false,
    },
    {
      id: "interior_leaks",
      label: "Interior leak photos (if applicable)",
      category: "photos",
      required: false,
      completed: false,
    },
    {
      id: "soft_metal_hits",
      label: "Soft metal hits (vents, gutters, flashing)",
      category: "photos",
      required: true,
      completed: false,
    },
    {
      id: "skylight_impacts",
      label: "Skylight impacts (if applicable)",
      category: "photos",
      required: false,
      completed: false,
    },
    {
      id: "drone_overview",
      label: "Drone overview photos",
      category: "photos",
      required: false,
      completed: false,
    },
    {
      id: "ladder_assist_report",
      label: "Ladder assist report",
      category: "documents",
      required: false,
      completed: false,
    },
    {
      id: "measurement_notes",
      label: "Measurement notes",
      category: "measurements",
      required: true,
      completed: false,
    },
    {
      id: "satellite_measurements",
      label: "Satellite measurements",
      category: "measurements",
      required: false,
      completed: false,
    },
  ]);

  const [timeUntilMeeting, setTimeUntilMeeting] = useState<string | null>(null);

  useEffect(() => {
    if (adjusterMeetingDate) {
      const updateTime = () => {
        const now = new Date();
        const meeting = new Date(adjusterMeetingDate);
        const diff = meeting.getTime() - now.getTime();

        if (diff <= 0) {
          setTimeUntilMeeting("Meeting time has passed");
          return;
        }

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;

        if (days > 0) {
          setTimeUntilMeeting(`${days} day${days > 1 ? "s" : ""} ${remainingHours} hour${remainingHours !== 1 ? "s" : ""}`);
        } else if (hours > 0) {
          setTimeUntilMeeting(`${hours} hour${hours > 1 ? "s" : ""}`);
        } else {
          const minutes = Math.floor(diff / (1000 * 60));
          setTimeUntilMeeting(`${minutes} minute${minutes !== 1 ? "s" : ""}`);
        }
      };

      updateTime();
      const interval = setInterval(updateTime, 60000); // Update every minute

      return () => clearInterval(interval);
    }
  }, [adjusterMeetingDate]);

  const toggleItem = (id: string) => {
    setChecklist((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
  };

  const completedCount = checklist.filter((item) => item.completed).length;
  const requiredCompleted = checklist.filter(
    (item) => item.required && item.completed
  ).length;
  const requiredTotal = checklist.filter((item) => item.required).length;
  const completionPercentage = Math.round(
    (requiredCompleted / requiredTotal) * 100
  );

  const isUrgent = adjusterMeetingDate
    ? new Date(adjusterMeetingDate).getTime() - Date.now() < 24 * 60 * 60 * 1000
    : false;

  const groupedChecklist = {
    photos: checklist.filter((item) => item.category === "photos"),
    documents: checklist.filter((item) => item.category === "documents"),
    measurements: checklist.filter((item) => item.category === "measurements"),
    other: checklist.filter((item) => item.category === "other"),
  };

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Adjuster Prep Kit
          </CardTitle>
          {isUrgent && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Urgent
            </Badge>
          )}
        </div>
        {adjusterMeetingDate && timeUntilMeeting && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
            <Clock className="h-4 w-4" />
            <span>
              Meeting in: <strong>{timeUntilMeeting}</strong>
            </span>
          </div>
        )}
        {insuranceMetadata?.adjuster_name && (
          <div className="text-sm text-muted-foreground mt-1">
            Adjuster: <strong>{insuranceMetadata.adjuster_name}</strong>
            {insuranceMetadata.claim_number && (
              <> • Claim #: {insuranceMetadata.claim_number}</>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Prep Progress</span>
            <span className="font-medium">
              {requiredCompleted}/{requiredTotal} Required Items
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                completionPercentage === 100
                  ? "bg-green-500"
                  : completionPercentage >= 70
                  ? "bg-yellow-500"
                  : "bg-red-500"
              }`}
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </div>

        {/* Auto-Generated Message */}
        <div className="bg-white p-3 rounded-lg border border-blue-200">
          <div className="text-sm font-medium mb-2">Prep Message for Homeowner</div>
          <div className="text-sm text-muted-foreground mb-2">
            Hi {insuranceMetadata?.adjuster_name ? "there" : "homeowner"}, before the adjuster arrives, here's what to expect:
          </div>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>The adjuster will inspect your roof for storm damage</li>
            <li>They'll take photos and measurements</li>
            <li>You may want to be present to point out specific areas of concern</li>
            <li>We can attend the meeting with you if you'd like</li>
          </ul>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full"
            onClick={() => {
              // Copy message to clipboard or open compose modal
              navigator.clipboard.writeText(
                `Hi ${insuranceMetadata?.adjuster_name || "there"}, before the adjuster arrives, here's what to expect:\n\n• The adjuster will inspect your roof for storm damage\n• They'll take photos and measurements\n• You may want to be present to point out specific areas of concern\n• We can attend the meeting with you if you'd like`
              );
            }}
          >
            Copy Message
          </Button>
        </div>

        {/* Checklist */}
        <div className="space-y-4">
          {/* Photos Section */}
          {groupedChecklist.photos.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Camera className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium text-sm">Photos</h4>
              </div>
              <div className="space-y-2">
                {groupedChecklist.photos.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-2 cursor-pointer hover:bg-white/50 p-2 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => toggleItem(item.id)}
                      className="sr-only"
                    />
                    {item.completed ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400" />
                    )}
                    <span
                      className={`text-sm ${
                        item.completed ? "line-through text-muted-foreground" : ""
                      }`}
                    >
                      {item.label}
                    </span>
                    {item.required && (
                      <Badge variant="outline" className="text-xs">
                        Required
                      </Badge>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Documents Section */}
          {groupedChecklist.documents.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium text-sm">Documents</h4>
              </div>
              <div className="space-y-2">
                {groupedChecklist.documents.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-2 cursor-pointer hover:bg-white/50 p-2 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => toggleItem(item.id)}
                      className="sr-only"
                    />
                    {item.completed ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400" />
                    )}
                    <span
                      className={`text-sm ${
                        item.completed ? "line-through text-muted-foreground" : ""
                      }`}
                    >
                      {item.label}
                    </span>
                    {item.required && (
                      <Badge variant="outline" className="text-xs">
                        Required
                      </Badge>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Measurements Section */}
          {groupedChecklist.measurements.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Drone className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium text-sm">Measurements</h4>
              </div>
              <div className="space-y-2">
                {groupedChecklist.measurements.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-2 cursor-pointer hover:bg-white/50 p-2 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => toggleItem(item.id)}
                      className="sr-only"
                    />
                    {item.completed ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400" />
                    )}
                    <span
                      className={`text-sm ${
                        item.completed ? "line-through text-muted-foreground" : ""
                      }`}
                    >
                      {item.label}
                    </span>
                    {item.required && (
                      <Badge variant="outline" className="text-xs">
                        Required
                      </Badge>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Upload Reminder */}
        <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
          <div className="flex items-start gap-2">
            <Upload className="h-4 w-4 text-yellow-600 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium text-yellow-900 mb-1">
                File Upload Reminder
              </div>
              <div className="text-yellow-800">
                Don't forget to upload: ladder assist report, measurement notes, and satellite measurements before the meeting.
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}





















































