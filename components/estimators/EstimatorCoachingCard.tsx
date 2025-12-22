"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type EstimatorCoachingReportData = {
  id: string;
  estimator_id: string;
  workspace_id: string;
  week_start: string;
  week_end: string;
  summary: string | null;
  strengths: string | null;
  weaknesses: string | null;
  action_items: string | null;
  opportunity: string | null;
  created_at: string;
};

type EstimatorCoachingCardProps = {
  report: EstimatorCoachingReportData;
  estimatorName?: string;
  className?: string;
};

export function EstimatorCoachingCard({
  report,
  estimatorName,
  className,
}: EstimatorCoachingCardProps) {
  return (
    <Card className={cn("p-5 rounded-xl border bg-white shadow-md", className)}>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-2">
          {estimatorName ? `${estimatorName}'s Weekly Coaching` : "Weekly Coaching"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Week of {new Date(report.week_start).toLocaleDateString()} -{" "}
          {new Date(report.week_end).toLocaleDateString()}
        </p>
      </div>

      {/* Coaching Sections */}
      {report.summary && (
        <Section
          title="Performance Summary"
          text={report.summary}
          variant="default"
        />
      )}

      {report.strengths && (
        <Section
          title="Strengths"
          text={report.strengths}
          variant="success"
        />
      )}

      {report.weaknesses && (
        <Section
          title="Areas for Improvement"
          text={report.weaknesses}
          variant="warning"
        />
      )}

      {report.action_items && (
        <Section
          title="Action Items (Next Week)"
          text={report.action_items}
          variant="info"
          isList={true}
        />
      )}

      {report.opportunity && (
        <Section
          title="Opportunity"
          text={report.opportunity}
          variant="success"
        />
      )}

      {!report.summary && !report.strengths && !report.weaknesses && !report.action_items && !report.opportunity && (
        <div className="text-sm text-muted-foreground">
          No coaching data available for this period.
        </div>
      )}
    </Card>
  );
}

function Section({
  title,
  text,
  variant = "default",
  isList = false,
}: {
  title: string;
  text: string;
  variant?: "default" | "success" | "warning" | "info";
  isList?: boolean;
}) {
  const getVariantStyles = () => {
    switch (variant) {
      case "success":
        return "bg-green-50 border-green-200 text-green-900";
      case "warning":
        return "bg-orange-50 border-orange-200 text-orange-900";
      case "info":
        return "bg-blue-50 border-blue-200 text-blue-900";
      default:
        return "bg-gray-50 border-gray-200 text-gray-900";
    }
  };

  const lines = text.split("\n").filter((line) => line.trim().length > 0);

  return (
    <div className={cn("mb-4 p-4 rounded-lg border", getVariantStyles())}>
      <h3 className="font-semibold mb-2 text-sm">{title}</h3>
      {isList ? (
        <ul className="list-disc list-inside space-y-1 text-sm">
          {lines.map((line, index) => (
            <li key={index}>{line.trim()}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm whitespace-pre-line">{text}</p>
      )}
    </div>
  );
}









































