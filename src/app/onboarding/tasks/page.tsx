// Block 95000 — Onboarding Engine UI
// Game-like onboarding experience with progress tracking

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, ArrowRight, Sparkles, Trophy } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface OnboardingTask {
  task_id: string;
  title: string;
  description: string;
  cta_text: string;
  cta_url: string;
  order_index: number;
  required: boolean;
  completed: boolean;
  completed_at: string | null;
}

interface OnboardingStatus {
  tasks: OnboardingTask[];
  first_login: boolean;
  progress: {
    completed: number;
    total: number;
    percent: number;
  };
  all_complete: boolean;
}

export default function OnboardingTasksPage() {
  const router = useRouter();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const res = await fetch("/api/onboarding/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        
        // If all tasks are complete, redirect to dashboard
        if (data.all_complete) {
          setTimeout(() => {
            router.push("/dashboard?onboarding=complete");
          }, 2000);
        }
      }
    } catch (error) {
      console.error("Error loading onboarding status:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTaskClick = async (task: OnboardingTask) => {
    if (task.completed) return;

    // Navigate to the task URL
    router.push(task.cta_url);
  };

  const handleTaskComplete = async (taskId: string, completed: boolean) => {
    setUpdating(taskId);
    try {
      const res = await fetch("/api/onboarding/task/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId, completed }),
      });

      if (res.ok) {
        const data = await res.json();
        // Reload status to get updated progress
        await loadStatus();

        // If all complete, show celebration
        if (data.all_complete) {
          // Celebration will be handled by the redirect in loadStatus
        }
      }
    } catch (error) {
      console.error("Error completing task:", error);
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600">Loading your onboarding...</p>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Failed to load onboarding status</p>
          <Button onClick={loadStatus} className="mt-4">Retry</Button>
        </div>
      </div>
    );
  }

  const { tasks, progress, all_complete } = status;
  const firstIncompleteTask = tasks.find((t) => !t.completed && t.required);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-indigo-100 text-indigo-700 px-4 py-2 rounded-full text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" />
            <span>Welcome to SmartSend</span>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Let's Get You Set Up
          </h1>
          <p className="text-lg text-gray-600">
            Complete these steps to start sending personalized emails that convert
          </p>
        </div>

        {/* Progress Bar */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-700">Your Progress</span>
            <span className="text-2xl font-bold text-indigo-600">
              {progress.percent}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
            <div
              className="bg-gradient-to-r from-indigo-500 to-purple-600 h-4 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
            <span>{progress.completed} of {progress.total} tasks completed</span>
            {firstIncompleteTask && (
              <span className="text-indigo-600 font-medium">
                Next: {firstIncompleteTask.title}
              </span>
            )}
          </div>
        </div>

        {/* Tasks List */}
        <div className="space-y-4">
          {tasks.map((task, index) => {
            const isCompleted = task.completed;
            const isNext = !isCompleted && task.required && task === firstIncompleteTask;

            return (
              <div
                key={task.task_id}
                className={`bg-white rounded-xl shadow-md p-6 transition-all duration-200 ${
                  isNext
                    ? "ring-2 ring-indigo-500 ring-offset-2"
                    : isCompleted
                    ? "opacity-75"
                    : "hover:shadow-lg"
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Checkbox/Status Icon */}
                  <div className="flex-shrink-0 mt-1">
                    {isCompleted ? (
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                        <CheckCircle2 className="h-6 w-6 text-green-600" />
                      </div>
                    ) : (
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          isNext
                            ? "bg-indigo-100 text-indigo-600"
                            : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        <span className="font-semibold">{index + 1}</span>
                      </div>
                    )}
                  </div>

                  {/* Task Content */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3
                          className={`text-lg font-semibold mb-1 ${
                            isCompleted
                              ? "text-gray-400 line-through"
                              : "text-gray-900"
                          }`}
                        >
                          {task.title}
                        </h3>
                        <p
                          className={`text-sm ${
                            isCompleted ? "text-gray-400" : "text-gray-600"
                          }`}
                        >
                          {task.description}
                        </p>
                      </div>

                      {/* CTA Button */}
                      <div className="flex-shrink-0">
                        {isCompleted ? (
                          <div className="px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm font-medium">
                            ✓ Done
                          </div>
                        ) : (
                          <Button
                            onClick={() => handleTaskClick(task)}
                            disabled={updating === task.task_id}
                            className={`${
                              isNext
                                ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                                : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                            }`}
                          >
                            {task.cta_text}
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Optional: Mark as complete checkbox for testing */}
                    {process.env.NODE_ENV === "development" && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isCompleted}
                            onChange={(e) =>
                              handleTaskComplete(task.task_id, e.target.checked)
                            }
                            disabled={updating === task.task_id}
                          />
                          <span>Mark as {isCompleted ? "incomplete" : "complete"}</span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Completion Celebration */}
        {all_complete && (
          <div className="mt-8 bg-gradient-to-r from-green-400 to-emerald-500 rounded-2xl shadow-xl p-8 text-center text-white">
            <Trophy className="h-16 w-16 mx-auto mb-4" />
            <h2 className="text-3xl font-bold mb-2">🎉 Onboarding Complete!</h2>
            <p className="text-lg mb-4 opacity-90">
              You're all set! Redirecting to your dashboard...
            </p>
          </div>
        )}

        {/* Help Text */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>
            Need help? Contact support at{" "}
            <a href="mailto:support@smartsendhq.com" className="text-indigo-600 hover:underline">
              support@smartsendhq.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}


























