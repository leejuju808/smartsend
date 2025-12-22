// app/dashboard/tasks/_components/TasksClient.tsx
"use client";

import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";

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

interface Props {
  tasks: TaskRow[];
}

function formatTimeAgo(dateString?: string | null) {
  if (!dateString) return "—";
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true });
  } catch {
    return dateString;
  }
}

export default function TasksClient({ tasks }: Props) {
  const router = useRouter();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todays = tasks.filter(
    (t) =>
      !t.completed_at &&
      new Date(t.due_at).getTime() >= today.getTime() &&
      new Date(t.due_at).getTime() < today.getTime() + 86400000
  );

  const overdue = tasks.filter(
    (t) =>
      !t.completed_at &&
      new Date(t.due_at).getTime() < today.getTime()
  );

  const completed = tasks.filter((t) => t.completed_at);

  async function completeTask(taskId: string) {
    await fetch("/api/tasks/complete", {
      method: "POST",
      body: JSON.stringify({ taskId }),
      headers: { "Content-Type": "application/json" },
    });

    router.refresh();
  }

  function TaskItem(t: TaskRow) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-xl border bg-background px-4 py-3 text-xs">
        <div className="flex flex-col gap-[2px]">
          {t.lead_id ? (
            <button
              type="button"
              onClick={() => router.push(`/dashboard/leads/${t.lead_id}`)}
              className="text-left text-[11px] font-semibold hover:underline"
            >
              {t.lead_name || t.lead_email || "Lead"}
            </button>
          ) : (
            <span className="text-[11px] font-semibold">
              {t.lead_name || t.lead_email || "Lead"}
            </span>
          )}
          <p className="text-[10px] text-muted-foreground">
            Due {formatTimeAgo(t.due_at)}
          </p>
          {t.reply_preview && (
            <p className="mt-[2px] line-clamp-2 text-[10px] text-muted-foreground">
              "{t.reply_preview}"
            </p>
          )}
        </div>

        {t.completed_at ? (
          <span className="rounded-full border border-emerald-600 bg-emerald-500/10 px-3 py-[3px] text-[10px] font-medium text-emerald-700">
            Completed
          </span>
        ) : (
          <button
            onClick={() => completeTask(t.task_id)}
            className="rounded-full border border-primary bg-primary px-3 py-[3px] text-[10px] font-medium text-primary-foreground"
          >
            Mark done
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-sm text-muted-foreground">
          Warm leads that need follow-up. This is where roofers make money.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium">Today</h2>

        {todays.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No tasks due today.
          </p>
        ) : (
          todays.map((t) => <TaskItem key={t.task_id} {...t} />)
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-red-600">Overdue</h2>

        {overdue.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No overdue tasks.
          </p>
        ) : (
          overdue.map((t) => <TaskItem key={t.task_id} {...t} />)
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-muted-foreground">
          Completed
        </h2>

        {completed.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No tasks completed yet.
          </p>
        ) : (
          completed.map((t) => <TaskItem key={t.task_id} {...t} />)
        )}
      </section>
    </div>
  );
}

