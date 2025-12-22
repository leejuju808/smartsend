"use client";

import { CampaignStep } from "./StepCard";
import { Calendar, Mail, Clock } from "lucide-react";

interface SequenceTimelineProps {
  steps: CampaignStep[];
}

export function SequenceTimeline({ steps }: SequenceTimelineProps) {
  const sortedSteps = [...steps]
    .filter((s) => s.enabled)
    .sort((a, b) => a.step_order - b.step_order);

  const calculateTimeline = () => {
    let currentDay = 1;
    const timeline: Array<{
      day: number;
      step: CampaignStep;
      label: string;
    }> = [];

    sortedSteps.forEach((step, index) => {
      if (index === 0) {
        timeline.push({
          day: currentDay,
          step,
          label: `Day ${currentDay}: ${step.type === "email" ? "Step 1" : "Wait"}`,
        });
      } else {
        const delayDays = Math.ceil(step.delay_hours / 24);
        currentDay += delayDays;
        timeline.push({
          day: currentDay,
          step,
          label: `Day ${currentDay}: Step ${step.step_order}`,
        });
      }
    });

    return timeline;
  };

  const timeline = calculateTimeline();

  if (timeline.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="text-sm">No steps in sequence</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Sequence Timeline</h3>
      <div className="space-y-3">
        {timeline.map((item, index) => (
          <div
            key={item.step.id || `timeline-${item.step.step_order}`}
            className="flex items-start gap-3"
          >
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                {item.step.type === "email" ? (
                  <Mail className="w-4 h-4 text-blue-600" />
                ) : (
                  <Clock className="w-4 h-4 text-blue-600" />
                )}
              </div>
              {index < timeline.length - 1 && (
                <div className="w-0.5 h-8 bg-gray-200 mt-1" />
              )}
            </div>
            <div className="flex-1 pb-4">
              <div className="text-sm font-medium text-gray-900">
                {item.label}
              </div>
              {item.step.type === "email" && item.step.subject && (
                <div className="text-xs text-gray-600 mt-1">
                  {item.step.subject}
                </div>
              )}
              {item.step.type === "wait" && (
                <div className="text-xs text-gray-600 mt-1">
                  Wait {Math.ceil(item.step.delay_hours / 24)} days
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}





















































