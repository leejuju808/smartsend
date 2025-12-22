"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, Users } from "lucide-react";

type NextStep = {
  start_date: string;
  end_date: string;
  crew_name: string | null;
  status: string;
};

interface NextStepCardProps {
  nextStep: NextStep;
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
};

export function NextStepCard({ nextStep }: NextStepCardProps) {
  const startDate = new Date(nextStep.start_date);
  const endDate = new Date(nextStep.end_date);
  const isToday = startDate.toDateString() === new Date().toDateString();
  const isTomorrow =
    startDate.toDateString() ===
    new Date(Date.now() + 24 * 60 * 60 * 1000).toDateString();

  let dateLabel = formatDate(nextStep.start_date);
  if (isToday) {
    dateLabel = "Today";
  } else if (isTomorrow) {
    dateLabel = "Tomorrow";
  }

  return (
    <Card className="bg-blue-50 border-blue-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-900">
          <Calendar className="h-5 w-5" />
          What&apos;s Next?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <Calendar className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <p className="font-semibold text-gray-900">{dateLabel}</p>
            <p className="text-sm text-gray-600">
              {startDate.toDateString() === endDate.toDateString()
                ? formatTime(nextStep.start_date) +
                  " - " +
                  formatTime(nextStep.end_date)
                : `${formatDate(nextStep.start_date)} - ${formatDate(nextStep.end_date)}`}
            </p>
          </div>
        </div>

        {nextStep.crew_name && (
          <div className="flex items-start gap-3">
            <Users className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-semibold text-gray-900">Crew</p>
              <p className="text-sm text-gray-600">{nextStep.crew_name}</p>
            </div>
          </div>
        )}

        {nextStep.status === "scheduled" && (
          <div className="mt-4 p-3 bg-white rounded-lg border border-blue-200">
            <p className="text-sm text-gray-700">
              <span className="font-semibold">Scheduled:</span> Crew is expected
              to arrive on {dateLabel.toLowerCase()}.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}







































