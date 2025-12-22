// app/dashboard/tasks/page.tsx

import { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import TasksClient from "./_components/TasksClient";

export const metadata: Metadata = {
  title: "Tasks · SmartSend",
};

type TaskRow = {
  task_id: string;
  workspace_id: string;
  campaign_id: string;
  contact_id: string;
  reply_id: string;
  task_type: string;
  due_at: string;
  completed_at: string | null;
  created_at: string;
  lead_id: string | null;
  lead_name: string | null;
  lead_email: string | null;
  estimated_value: number | null;
  currency: string | null;
  reply_intent: string | null;
  reply_preview: string | null;
  reply_received_at: string | null;
};

async function loadTasks(): Promise<TaskRow[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("followup_tasks_with_lead")
    .select("*")
    .order("due_at", { ascending: true })
    .limit(200);

  if (error || !data) {
    console.error("Error loading followup_tasks:", error);
    return [];
  }

  return data as TaskRow[];
}

export default async function TasksPage() {
  const tasks = await loadTasks();

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <TasksClient tasks={tasks} />
    </div>
  );
}


























































