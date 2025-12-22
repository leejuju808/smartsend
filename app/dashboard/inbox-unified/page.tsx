"use client";

// Block 21420 — SmartSend Inbox UI: Reply + Intent + Tasks Panel v1
// Unified inbox panel that shows replies, intent classification, and tasks

import { useEffect, useState } from "react";

type IntentLabel =
  | "hot"
  | "warm"
  | "schedule"
  | "followup"
  | "question"
  | "not_interested"
  | null;

type InboxItem = {
  id: string;
  lead_id: string | null;
  subject: string;
  preview: string;
  received_at: string;
  from_name: string;
  from_email: string;
  intent: IntentLabel;
};

type EmailDetail = {
  id: string;
  lead_id: string | null;
  subject: string;
  body: string;
  from_name: string;
  from_email: string;
  received_at: string;
  intent: IntentLabel;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "completed";
  due_date: string;
  priority: "low" | "normal" | "high";
};

export default function InboxUnifiedPage() {
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [emailDetail, setEmailDetail] = useState<EmailDetail | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);

  useEffect(() => {
    loadInbox();
  }, []);

  useEffect(() => {
    if (selectedEmailId) {
      loadEmailDetail(selectedEmailId);
    }
  }, [selectedEmailId]);

  async function loadInbox() {
    try {
      const res = await fetch("/api/inbox-unified");
      if (!res.ok) {
        console.error("Failed to load inbox");
        return;
      }
      const data = await res.json();
      setInbox(data);
      if (data.length > 0) {
        setSelectedEmailId(data[0].id);
      }
    } catch (error) {
      console.error("Error loading inbox:", error);
    }
  }

  async function loadEmailDetail(emailId: string) {
    setLoadingEmail(true);
    try {
      const res = await fetch(`/api/inbox-unified/${emailId}`);
      if (!res.ok) {
        console.error("Failed to load email detail");
        setLoadingEmail(false);
        return;
      }
      const data = await res.json();
      setEmailDetail(data);
      setLoadingEmail(false);

      if (data.lead_id) {
        loadTasksForLead(data.lead_id);
      } else {
        setTasks([]);
      }
    } catch (error) {
      console.error("Error loading email detail:", error);
      setLoadingEmail(false);
    }
  }

  async function loadTasksForLead(leadId: string) {
    setLoadingTasks(true);
    try {
      const res = await fetch(`/api/tasks?lead_id=${leadId}`);
      if (!res.ok) {
        console.error("Failed to load tasks");
        setLoadingTasks(false);
        return;
      }
      const data = await res.json();
      setTasks(data);
      setLoadingTasks(false);
    } catch (error) {
      console.error("Error loading tasks:", error);
      setLoadingTasks(false);
    }
  }

  async function handleCompleteTask(taskId: string) {
    try {
      const res = await fetch(`/api/tasks/${taskId}/complete`, {
        method: "POST",
      });

      if (!res.ok) {
        console.error("Failed to complete task");
        return;
      }

      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: "completed" } : t
        )
      );
    } catch (error) {
      console.error("Error completing task:", error);
    }
  }

  function renderIntentBadge(intent: IntentLabel) {
    if (!intent) return null;

    const labelMap: Record<string, string> = {
      hot: "Hot Lead",
      warm: "Warm Lead",
      schedule: "Schedule",
      followup: "Follow-Up",
      question: "Question",
      not_interested: "Not Interested",
    };

    const colorMap: Record<string, string> = {
      hot: "bg-red-100 text-red-700 border-red-200",
      warm: "bg-orange-100 text-orange-700 border-orange-200",
      schedule: "bg-emerald-100 text-emerald-700 border-emerald-200",
      followup: "bg-blue-100 text-blue-700 border-blue-200",
      question: "bg-purple-100 text-purple-700 border-purple-200",
      not_interested: "bg-gray-100 text-gray-600 border-gray-200",
    };

    const label = labelMap[intent];
    const color = colorMap[intent];

    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}
      >
        {label}
      </span>
    );
  }

  return (
    <div className="h-full flex gap-4">
      {/* LEFT: Inbox list */}
      <div className="w-1/3 bg-white border rounded-lg shadow-sm flex flex-col">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="text-sm font-semibold">Inbox</h2>
          <span className="text-xs text-gray-500">
            {inbox.length} replies
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {inbox.length === 0 && (
            <p className="p-4 text-xs text-gray-500">
              No replies yet. Your campaigns will show up here.
            </p>
          )}

          {inbox.map((item) => {
            const isSelected = item.id === selectedEmailId;
            return (
              <button
                key={item.id}
                onClick={() => setSelectedEmailId(item.id)}
                className={`w-full text-left px-4 py-3 border-b flex flex-col gap-1 hover:bg-gray-50 ${
                  isSelected ? "bg-gray-50" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-900">
                    {item.from_name || item.from_email}
                  </span>
                  {renderIntentBadge(item.intent)}
                </div>
                <p className="text-xs font-semibold text-gray-800 truncate">
                  {item.subject || "(no subject)"}
                </p>
                <p className="text-[11px] text-gray-500 line-clamp-2">
                  {item.preview}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* MIDDLE: Email detail */}
      <div className="w-1/3 bg-white border rounded-lg shadow-sm flex flex-col">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="text-sm font-semibold">Email</h2>
          {emailDetail?.intent && renderIntentBadge(emailDetail.intent)}
        </div>

        {loadingEmail && (
          <div className="flex-1 flex items-center justify-center text-xs text-gray-500">
            Loading email…
          </div>
        )}

        {!loadingEmail && !emailDetail && (
          <div className="flex-1 flex items-center justify-center text-xs text-gray-500">
            Select an email from the left.
          </div>
        )}

        {!loadingEmail && emailDetail && (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            <div>
              <p className="text-xs text-gray-500">
                From:{" "}
                <span className="font-medium text-gray-800">
                  {emailDetail.from_name || emailDetail.from_email}
                </span>
              </p>
              <p className="text-xs text-gray-500">
                {new Date(emailDetail.received_at).toLocaleString()}
              </p>
            </div>

            <h3 className="text-sm font-semibold">
              {emailDetail.subject || "(no subject)"}
            </h3>

            <pre className="text-xs text-gray-800 whitespace-pre-wrap bg-gray-50 border rounded-md p-3">
              {emailDetail.body}
            </pre>

            <div className="mt-3 flex gap-2">
              <button className="text-xs px-3 py-1.5 rounded-md border text-gray-700 hover:bg-gray-50">
                Reply
              </button>
              <button className="text-xs px-3 py-1.5 rounded-md border text-gray-700 hover:bg-gray-50">
                Call logged
              </button>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: Tasks for this lead */}
      <div className="w-1/3 bg-white border rounded-lg shadow-sm flex flex-col">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="text-sm font-semibold">Tasks for this Lead</h2>
          <span className="text-xs text-gray-500">
            {tasks.filter((t) => t.status === "pending").length} open
          </span>
        </div>

        {loadingTasks && (
          <div className="flex-1 flex items-center justify-center text-xs text-gray-500">
            Loading tasks…
          </div>
        )}

        {!loadingTasks && emailDetail && tasks.length === 0 && (
          <div className="flex-1 flex items-center justify-center px-4 text-xs text-gray-500 text-center">
            No tasks yet. SmartSend will create tasks automatically when this
            lead replies with intent.
          </div>
        )}

        {!loadingTasks && tasks.length > 0 && (
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="border rounded-md px-3 py-2 flex flex-col gap-1"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-800">
                    {task.title}
                  </p>
                  <span className="text-[10px] text-gray-500">
                    due {task.due_date}
                  </span>
                </div>
                {task.description && (
                  <p className="text-[11px] text-gray-500">
                    {task.description}
                  </p>
                )}

                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wide text-gray-500">
                    {task.priority === "high"
                      ? "HIGH PRIORITY"
                      : task.priority === "low"
                      ? "LOW PRIORITY"
                      : "NORMAL"}
                  </span>

                  {task.status === "pending" ? (
                    <button
                      onClick={() => handleCompleteTask(task.id)}
                      className="text-[11px] px-2 py-1 rounded-md border text-emerald-700 hover:bg-emerald-50"
                    >
                      Mark done
                    </button>
                  ) : (
                    <span className="text-[10px] text-emerald-600">
                      Completed
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}














































