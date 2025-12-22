"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Camera, AlertTriangle, Package, CheckCircle, Play } from "lucide-react";

type TimelineEntry = {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  type: string;
};

interface LiveTimelineFeedProps {
  timeline: TimelineEntry[];
}

const getTimelineIcon = (type: string) => {
  switch (type) {
    case "start":
      return <Play className="h-4 w-4 text-green-600" />;
    case "photo":
      return <Camera className="h-4 w-4 text-blue-600" />;
    case "change_order":
      return <AlertTriangle className="h-4 w-4 text-orange-600" />;
    case "material":
      return <Package className="h-4 w-4 text-purple-600" />;
    case "punch":
      return <CheckCircle className="h-4 w-4 text-yellow-600" />;
    case "stop":
      return <Clock className="h-4 w-4 text-gray-600" />;
    default:
      return <Clock className="h-4 w-4 text-gray-600" />;
  }
};

const formatTimestamp = (timestamp: string) => {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return timestamp;
  }
};

export function LiveTimelineFeed({ timeline }: LiveTimelineFeedProps) {
  if (timeline.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Live Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 text-center py-4">
            No timeline events yet. Updates will appear here as work progresses.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Timeline</CardTitle>
        <p className="text-sm text-gray-500 mt-1">
          Real-time updates from your roofing crew
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {timeline.map((entry, index) => (
            <div key={entry.id} className="flex gap-4">
              {/* Timeline line */}
              <div className="flex flex-col items-center">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 border-2 border-gray-300">
                  {getTimelineIcon(entry.type)}
                </div>
                {index < timeline.length - 1 && (
                  <div className="w-0.5 h-full bg-gray-200 mt-2" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 pb-4">
                <div className="flex items-start justify-between mb-1">
                  <h4 className="font-semibold text-sm text-gray-900">
                    {entry.title}
                  </h4>
                  <span className="text-xs text-gray-500 whitespace-nowrap ml-4">
                    {formatTimestamp(entry.timestamp)}
                  </span>
                </div>
                {entry.description && (
                  <p className="text-sm text-gray-600 mt-1">
                    {entry.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

