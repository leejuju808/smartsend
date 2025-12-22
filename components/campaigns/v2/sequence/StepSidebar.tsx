"use client";

import { Mail, Clock, GitBranch, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StepSidebarProps {
  onAddStep: (type: "email" | "delay" | "condition" | "tag") => void;
  planKey: string;
  isOpen: boolean;
  onClose: () => void;
}

export function StepSidebar({
  onAddStep,
  planKey,
  isOpen,
  onClose,
}: StepSidebarProps) {
  const stepTypes = [
    {
      type: "email" as const,
      icon: Mail,
      label: "Email",
      description: "Send personalized email",
      available: true,
    },
    {
      type: "delay" as const,
      icon: Clock,
      label: "Delay",
      description: "Wait before next step",
      available: true,
    },
    {
      type: "condition" as const,
      icon: GitBranch,
      label: "Condition",
      description: "Branch based on behavior",
      available: planKey !== "starter",
      upgradeRequired: planKey === "starter",
    },
    {
      type: "tag" as const,
      icon: Tag,
      label: "Tag",
      description: "Apply label to lead",
      available: true,
    },
  ];

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r flex flex-col transition-transform duration-300",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-sm font-semibold">Add Step</h2>
          <button
            onClick={onClose}
            className="lg:hidden text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {stepTypes.map((stepType) => {
            const Icon = stepType.icon;
            return (
              <button
                key={stepType.type}
                onClick={() => {
                  if (stepType.available) {
                    onAddStep(stepType.type);
                  }
                }}
                disabled={!stepType.available}
                className={cn(
                  "w-full p-3 rounded-lg border-2 text-left transition-all",
                  stepType.available
                    ? "border-gray-200 hover:border-blue-500 hover:bg-blue-50 cursor-pointer"
                    : "border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed"
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "p-2 rounded",
                      stepType.available
                        ? "bg-blue-100 text-blue-600"
                        : "bg-gray-100 text-gray-400"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900">
                      {stepType.label}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {stepType.description}
                    </div>
                    {stepType.upgradeRequired && (
                      <div className="text-xs text-orange-600 mt-1">
                        Upgrade required
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t bg-gray-50">
          <p className="text-xs text-gray-500">
            Drag steps to reorder them in your sequence
          </p>
        </div>
      </div>
    </>
  );
}
















































