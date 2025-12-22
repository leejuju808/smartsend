# Smart Send — Auto-pause Sequences On Reply Implementation

## Overview
This implementation adds automatic sequence pausing when a lead replies, preventing unwanted follow-ups after engagement.

## Files Created/Modified

### Database Migrations

#### 1. `supabase/migrations/20251231_auto_pause_on_reply.sql`
- Creates simplified `mark_lead_replied` RPC function
- Signature: `mark_lead_replied(p_lead_id uuid, p_reply_id uuid default null)`
- **Actions**:
  - Updates `leads.status` to 'replied'
  - Sets `replied_at` timestamp (from reply if provided, otherwise now())
  - Updates `updated_at`
- **Auto-cancellation**: Trigger `trg_cancel_future_sends_on_reply` (from `20251025_stop_followups_when_replied.sql`) automatically cancels pending queue items

### API Endpoints

#### 2. `src/app/api/leads/mark-replied/route.ts`
POST endpoint to manually mark a lead as replied
- **Body**: `{ lead_id, reply_id? }`
- **Actions**:
  - Calls `mark_lead_replied` RPC
  - Pauses all pending sends for the lead
- **Returns**: `{ ok: true }` or error

#### 3. `src/app/api/replies/handle/route.ts` (Modified)
- Added optional call to `mark_lead_replied` RPC when marking reply as handled
- Best-effort: doesn't fail if RPC call errors
- Automatically pauses sequences when replying

### UI Updates

#### 4. `src/app/dashboard/replies/RepliesInbox.tsx` (Modified)
- Added call to `/api/leads/mark-replied` after successful reply send
- Shows success toast: "Sent to {email} and sequence paused ✅"
- Prevents accidental follow-ups after manual replies

#### 5. `src/app/campaigns/[id]/LeadsTable.tsx` (Already Existed)
- Shows "Replied" badge when lead status is 'replied'
- Visual indicator for leads that have been paused

## Database Schema

### RPC Function
```sql
create or replace function public.mark_lead_replied(
  p_lead_id uuid,
  p_reply_id uuid default null
) returns void
language plpgsql
security definer
as $$
begin
  -- 1) Update lead to replied status
  update public.leads
     set status = 'replied',
         replied_at = coalesce((select created_at from public.replies where id = p_reply_id), now()),
         updated_at = now()
   where id = p_lead_id;

  -- 2) Cancel all pending queue items (auto-canceled by trigger)
  -- The trigger in 20251025_stop_followups_when_replied.sql handles this
end
$$;
```

### Trigger (Already Existed)
```sql
create or replace function public.cancel_future_sends_on_reply()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'UPDATE' and new.status = 'replied' and old.status is distinct from 'replied') then
    update public.send_queue sq
       set status = 'canceled',
           last_error = 'Auto-canceled because lead replied at ' || coalesce(new.replied_at, now())::text
     where sq.lead_id = new.id
       and sq.status = 'pending'
       and sq.scheduled_at > now();
  end if;
  return new;
end $$;
```

## Usage

### Wire-up #1: When operator sends reply in SmartReplyPanel
```typescript
// src/app/dashboard/replies/RepliesInbox.tsx
const sendOk = await fetch('/api/replies/send', { ... })

if (sendOk.ok) {
  // Immediately pause follow-ups and mark lead as replied
  await fetch('/api/leads/mark-replied', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead_id: row.lead_id, reply_id: null })
  })
  toast.success('Reply enqueued and sequence paused ✅')
}
```

### Wire-up #2: When marking a reply as handled (Optional)
```typescript
// src/app/api/replies/handle/route.ts
// Automatically calls mark_lead_replied RPC when marking reply as handled
const { data: reply } = await supabase
  .from("replies")
  .select("lead_id")
  .eq("id", reply_id)
  .single();

if (reply?.lead_id) {
  await supabase.rpc('mark_lead_replied', {
    p_lead_id: reply.lead_id,
    p_reply_id: reply_id
  });
}
```

### UI Badge Logic
```typescript
// src/app/campaigns/[id]/LeadsTable.tsx
{lead.status === 'replied' ? (
  <Badge className="bg-green-500/20 text-green-300 border border-green-400/30">
    Replied
  </Badge>
) : /* other statuses */}
```

## Testing

To test this implementation:

1. **Apply Migrations**:
   ```bash
   supabase migration up
   ```

2. **Test Manual API**:
   ```bash
   curl -X POST http://localhost:3000/api/leads/mark-replied \
     -H "Content-Type: application/json" \
     -d '{"lead_id": "uuid-here"}'
   ```

3. **Verify UI**:
   - Send a reply in `/dashboard/replies`
   - Check that success toast appears: "Sent and sequence paused ✅"
   - Verify lead shows "Replied" badge in campaigns table
   - Confirm no follow-up emails are queued

## Flow Diagram

```
User Sends Reply
      ↓
/api/replies/send (success)
      ↓
/api/leads/mark-replied
      ↓
mark_lead_replied RPC
      ↓
Updates leads.status = 'replied'
      ↓
Trigger fires: cancel_future_sends_on_reply
      ↓
Cancels pending send_queue items
      ↓
User sees: "Sent and sequence paused ✅"
```

## Notes

- The implementation uses existing infrastructure (trigger from earlier migration)
- RPC is idempotent: safe to call multiple times
- Trigger automatically handles queue cancellation
- UI already shows status badges for replied leads
- Best-effort in reply handling: won't fail if RPC errors

## Future Enhancements

Potential next steps:
- Add webhook endpoint for provider notifications (already scaffolded in user request)
- Add analytics on paused sequences
- Add UI to manually resume paused sequences
- Add notification when sequence is paused
- Add audit log of pause events

