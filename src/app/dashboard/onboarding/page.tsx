"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { CheckCircle2, Circle, Sparkles, ArrowRight, Check } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface OnboardingTask {
  id: string;
  key: string;
  title: string;
  description: string | null;
  orderIndex: number;
  completed: boolean;
  completedAt: string | null;
}

interface OnboardingData {
  tasks: OnboardingTask[];
  completionPercent: number;
  completedCount: number;
  totalCount: number;
}

// Map task keys to URLs
const taskUrls: Record<string, string> = {
  add_company_name_logo: "/dashboard/settings",
  connect_sending_inbox: "/dashboard/settings/mailbox",
  pick_campaign_template: "/campaigns/new",
  personalize_openers: "/campaigns/new",
  set_sending_schedule: "/campaigns/new",
  launch_first_25_emails: "/campaigns/new",
  review_replies: "/dashboard/inbox",
};

export default function OnboardingPage() {
  const router = useRouter();
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await fetch("/api/onboarding/tasks");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleTask = async (taskId: string, currentStatus: boolean) => {
    setUpdating(taskId);
    try {
      const res = await fetch("/api/onboarding/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          completed: !currentStatus,
        }),
      });

      if (res.ok) {
        await fetchTasks(); // Refresh data
      }
    } catch (error) {
      console.error("Error updating task:", error);
    } finally {
      setUpdating(null);
    }
  };

  const handleTaskClick = (task: OnboardingTask) => {
    const url = taskUrls[task.key];
    if (url) {
      router.push(url);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center text-gray-500">Failed to load onboarding tasks</div>
      </div>
    );
  }

  const nextTask = data.tasks.find((t) => !t.completed);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Get Started with SmartSend</h1>
        <p className="text-gray-600">
          Complete these steps to launch your first roofing campaign and start booking jobs.
        </p>
      </div>

      {/* Progress Card */}
      <Card className="border-2 border-blue-200 bg-blue-50/50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-blue-900">Your Progress</span>
            </div>
            <span className="text-2xl font-bold text-blue-900">
              {data.completionPercent}%
            </span>
          </div>
          <Progress value={data.completionPercent} className="h-3 mb-2" />
          <p className="text-sm text-blue-800">
            {data.completedCount} of {data.totalCount} tasks completed
          </p>
        </CardContent>
      </Card>

      {/* Tasks List */}
      <Card>
        <CardHeader>
          <CardTitle>Setup Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.tasks.map((task) => {
              const isUpdating = updating === task.id;
              const hasUrl = !!taskUrls[task.key];

              return (
                <div
                  key={task.id}
                  className={`flex items-start gap-4 p-4 rounded-lg border transition-all ${
                    task.completed
                      ? "bg-green-50 border-green-200"
                      : "bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm"
                  }`}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleTask(task.id, task.completed)}
                    disabled={isUpdating}
                    className={`mt-0.5 flex-shrink-0 ${
                      task.completed ? "text-green-600" : "text-gray-400 hover:text-gray-600"
                    } transition-colors`}
                  >
                    {task.completed ? (
                      <CheckCircle2 className="w-6 h-6" />
                    ) : (
                      <Circle className="w-6 h-6" />
                    )}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3
                          className={`font-semibold mb-1 ${
                            task.completed ? "text-gray-500 line-through" : "text-gray-900"
                          }`}
                        >
                          {task.title}
                        </h3>
                        {task.description && (
                          <p
                            className={`text-sm ${
                              task.completed ? "text-gray-400" : "text-gray-600"
                            }`}
                          >
                            {task.description}
                          </p>
                        )}
                        {task.completed && task.completedAt && (
                          <p className="text-xs text-gray-400 mt-1">
                            Completed {new Date(task.completedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>

                      {/* Action Button */}
                      {!task.completed && hasUrl && (
                        <Button
                          onClick={() => handleTaskClick(task)}
                          size="sm"
                          className="flex-shrink-0"
                        >
                          {task.key === "review_replies" ? "View Replies" : "Get Started"}
                          <ArrowRight className="w-4 h-4 ml-1" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Next Step CTA */}
      {nextTask && (
        <Card className="border-2 border-indigo-200 bg-indigo-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-indigo-900 mb-1">Next Step</h3>
                <p className="text-sm text-indigo-800">{nextTask.title}</p>
              </div>
              {taskUrls[nextTask.key] && (
                <Button
                  onClick={() => handleTaskClick(nextTask)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completion Message */}
      {data.completionPercent === 100 && (
        <Card className="border-2 border-green-200 bg-green-50">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-green-900 mb-2">🎉 You're All Set!</h3>
            <p className="text-green-800 mb-4">
              You've completed the onboarding checklist. Start sending campaigns and booking jobs!
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                onClick={() => router.push("/campaigns")}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                View Campaigns
              </Button>
              <Button
                onClick={() => router.push("/dashboard")}
                variant="outline"
                className="border-green-600 text-green-700 hover:bg-green-100"
              >
                Go to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
