# Block 9600 — Tasks & Follow-Up Queue Implementation

## ✅ Implementation Complete

Block 9600 has been successfully implemented, providing SmartSend with a centralized task engine so contractors never forget to follow up with homeowners.

## 📦 What Was Built

### 1. Database Schema
- **Migration**: `supabase/migrations/20250131000001_block_9600_tasks_system.sql`
- **Table**: `tasks` with full RLS policies
- **Auto-generation triggers**: Hot/warm lead tasks, no-reply checker, inspection reminders
- **Indexes**: Optimized for common queries (org_id, assigned_to, due_at, completed)

### 2. API Routes
- **GET** `/api/tasks` - List tasks with filters and grouping
- **POST** `/api/tasks` - Create new task
- **PATCH** `/api/tasks/[id]` - Update task (title, due date, assignee, completion)
- **DELETE** `/api/tasks/[id]` - Delete task

### 3. React Hooks
- `useTasks(filters)` - Fetch and filter tasks
- `useCreateTask()` - Create new tasks
- `useUpdateTask()` - Update existing tasks
- `useDeleteTask()` - Delete tasks

### 4. Frontend Components
- **Tasks Page** (`/tasks`) - Full dashboard with filters and grouped task lists
- **TaskRow** - Individual task component with completion, links, and actions
- **CreateTaskModal** - Reusable modal for creating tasks from anywhere

### 5. Auto-Generation Logic
- **Hot Lead Tasks**: Auto-created when `intent = 'hot'` (due in 24 hours)
- **Warm Lead Tasks**: Auto-created when `intent = 'warm'` (due in 48 hours)
- **No-Reply Tasks**: Created for contacts with no replies after 7 days
- **Inspection Reminders**: Created 24 hours before inspection date

### 6. Notifications Integration
- Integrated with Block 9500 notifications system
- Task due notifications created automatically
- Cron job function: `tasks-maintenance-cron` (runs hourly)

## 🗂️ File Structure

```
supabase/migrations/
  └── 20250131000001_block_9600_tasks_system.sql    # Main migration
  └── 20250131000002_block_9600_tasks_cron.sql      # Cron job docs

supabase/functions/
  └── tasks-maintenance-cron/
      └── index.ts                                    # Hourly maintenance job

src/app/api/tasks/
  └── route.ts                                        # GET, POST /api/tasks
  └── [id]/route.ts                                   # PATCH, DELETE /api/tasks/[id]

src/hooks/
  └── useTasks.ts                                     # React hooks

src/components/tasks/
  └── CreateTaskModal.tsx                             # Task creation modal
  └── TaskRow.tsx                                     # Task row component

src/app/tasks/
  └── page.tsx                                        # Main tasks page
```

## 🚀 Usage

### Creating Tasks Manually

```tsx
import { CreateTaskModal } from "@/components/tasks/CreateTaskModal";

<CreateTaskModal
  open={isOpen}
  onOpenChange={setIsOpen}
  defaultContactId={contactId}
  defaultReplyThreadId={threadId}
  onSuccess={() => console.log("Task created!")}
/>
```

### Using Tasks Hook

```tsx
import { useTasks, useCreateTask } from "@/hooks/useTasks";

function MyComponent() {
  const { data, loading, reload } = useTasks({
    status: "open",
    assignedTo: "me",
    dateRange: "today",
  });

  const { createTask } = useCreateTask();

  const handleCreate = async () => {
    await createTask({
      title: "Call homeowner",
      dueAt: "2025-02-01T10:00:00",
      assignedTo: userId,
      contactId: contactId,
    });
    reload();
  };
}
```

## 🔄 Auto-Generation

### Hot/Warm Lead Tasks
Tasks are automatically created when a new `message_intent` row is inserted with `intent = 'hot'` or `'warm'`. The trigger `trg_create_task_from_intent` handles this.

### No-Reply Re-engagement
The function `create_no_reply_tasks()` checks for contacts that:
- Started a sequence > 7 days ago
- Have no replies
- Don't already have an active no-reply task

Runs hourly via `tasks-maintenance-cron`.

### Inspection Reminders
When a contact's `inspection_date` is set, a reminder task is created 24 hours before the inspection.

## 📅 Cron Job Setup

The `tasks-maintenance-cron` function should be scheduled to run hourly:

**Via Supabase Dashboard:**
1. Go to Database → Scheduler
2. Create new job:
   - Name: `tasks-maintenance`
   - Schedule: `0 * * * *` (every hour)
   - Target: Edge Function
   - Function: `tasks-maintenance-cron`
   - Method: POST

**Via config.toml:**
```toml
[cron.jobs."tasks-maintenance"]
schedule = "0 * * * *"
endpoint = "/functions/v1/tasks-maintenance-cron"
verify_jwt = false
```

## ✅ Acceptance Criteria

- ✅ `/tasks` page shows all tasks grouped by date (Overdue, Today, Tomorrow, This Week, Later)
- ✅ User can create + edit + complete tasks
- ✅ Clicking task brings you to the linked contact
- ✅ Reply detail panel can have "Create Task" button (component ready)
- ✅ HOT/WARM replies auto-create tasks with correct due dates
- ✅ Overdue/due tasks trigger notifications (Block 9500)
- ✅ RLS guarantees correct org-level task access

## 🔗 Integration Points

### Reply Detail Panel
Add a "Create Task" button that opens `CreateTaskModal`:

```tsx
import { CreateTaskModal } from "@/components/tasks/CreateTaskModal";

<CreateTaskModal
  open={taskModalOpen}
  onOpenChange={setTaskModalOpen}
  defaultReplyThreadId={threadId}
  defaultContactId={contactId}
/>
```

### Contact Profile Page
Add task creation button in contact actions:

```tsx
<CreateTaskModal
  open={taskModalOpen}
  onOpenChange={setTaskModalOpen}
  defaultContactId={contact.id}
/>
```

### Dashboard Hot Leads
Add quick task creation for hot leads:

```tsx
<CreateTaskModal
  open={taskModalOpen}
  onOpenChange={setTaskModalOpen}
  defaultContactId={lead.contactId}
  defaultReplyThreadId={lead.threadId}
/>
```

## 🎯 Next Steps (Future Enhancements)

1. **User Picker**: Replace user ID input with a proper user picker component
2. **Task Templates**: Pre-defined task templates for common follow-ups
3. **Recurring Tasks**: Support for recurring tasks (daily, weekly, etc.)
4. **Task Comments**: Add comments/notes history to tasks
5. **Task Dependencies**: Link tasks to other tasks
6. **Bulk Actions**: Select multiple tasks for bulk complete/delete/reassign
7. **Task Analytics**: Dashboard showing task completion rates, overdue trends

## 📝 Notes

- The tasks table uses `org_id` for multi-tenant isolation
- RLS policies ensure users can only see tasks in their org
- Auto-generated tasks are marked with `auto_generated = true` and `auto_type`
- Task notifications integrate seamlessly with Block 9500 notifications system
- The no-reply checker respects existing tasks to avoid duplicates





























































