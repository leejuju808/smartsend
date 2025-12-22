"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Home, MapPin } from "lucide-react";

type Job = {
  id: string;
  name: string;
  address: string | null;
  status: string;
  progress_percent: number;
  crew_name: string | null;
};

interface JobHeaderProps {
  job: Job;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-800 border-green-200";
    case "in_progress":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "scheduled":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "unscheduled":
      return "bg-gray-100 text-gray-800 border-gray-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "completed":
      return "Completed";
    case "in_progress":
      return "In Progress";
    case "scheduled":
      return "Scheduled";
    case "unscheduled":
      return "Not Started";
    default:
      return status.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());
  }
};

export function JobHeader({ job }: JobHeaderProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-2xl mb-2 flex items-center gap-2">
              <Home className="h-6 w-6 text-blue-600" />
              {job.name}
            </CardTitle>
            {job.address && (
              <div className="flex items-center gap-2 text-gray-600 mt-1">
                <MapPin className="h-4 w-4" />
                <span className="text-sm">{job.address}</span>
              </div>
            )}
          </div>
          <Badge className={getStatusColor(job.status)}>
            {getStatusLabel(job.status)}
          </Badge>
        </div>
      </CardHeader>
      {job.crew_name && (
        <CardContent className="pt-0">
          <p className="text-sm text-gray-600">
            Crew: <span className="font-medium">{job.crew_name}</span>
          </p>
        </CardContent>
      )}
    </Card>
  );
}







































