# Inbox System Implementation

## Overview

The SmartSend AI inbox system provides a centralized way to manage and respond to campaign replies. It automatically creates threads when replies come in, tracks conversation history, and provides a team-friendly interface for managing customer communications.

## Features

- **Automatic Thread Creation**: Replies automatically create inbox threads
- **Team Collaboration**: Assign threads to team members
- **Status Management**: Open, snooze, or close threads
- **Full Conversation History**: View all messages in a thread
- **Campaign Integration**: Link replies to specific campaigns
- **AI-Powered Intent Detection**: Automatically categorize reply intent

## Database Schema

### inbox_threads
```sql
create table public.inbox_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id),
  campaign_id uuid references public.campaigns(id) on delete set null,
  subject text,
  last_message_at timestamptz default now(),
  status text check (status in ('open','snoozed','closed')) default 'open',
  assigned_to uuid references auth.users(id),
  created_at timestamptz not null default now()
);
```

### inbox_messages
```sql
create table public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.inbox_threads(id) on delete cascade,
  sender text not null,
  body text not null,
  sent_at timestamptz default now(),
  is_incoming boolean default true
);
```

## API Endpoints

### GET /api/inbox/threads
List all inbox threads for a workspace.

**Query Parameters:**
- `workspaceId` (required): Workspace ID
- `status` (optional): Filter by status (open, snoozed, closed)
- `assignedTo` (optional): Filter by assigned user

**Response:**
```json
{
  "threads": [
    {
      "id": "uuid",
      "subject": "Subject line",
      "status": "open",
      "last_message_at": "2024-01-01T00:00:00Z",
      "contacts": {
        "email": "user@example.com",
        "first_name": "John",
        "company": "Company Inc"
      },
      "campaigns": {
        "name": "Campaign Name"
      }
    }
  ]
}
```

### GET /api/inbox/thread?id={threadId}
Get a specific thread with all its messages.

**Response:**
```json
{
  "thread": {
    "id": "uuid",
    "subject": "Subject",
    "status": "open",
    "contacts": {...},
    "campaigns": {...}
  },
  "messages": [
    {
      "id": "uuid",
      "sender": "user@example.com",
      "body": "Message content",
      "is_incoming": true,
      "sent_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### PATCH /api/inbox/threads
Update thread status or assignment.

**Body:**
```json
{
  "threadId": "uuid",
  "status": "closed",
  "assigned_to": "user-uuid"
}
```

## Integration Points

### 1. Inbound Reply Processing

The system automatically creates inbox threads when replies come in through the `ReplyProcessor` class in `src/lib/replies.ts`.

**Flow:**
1. Inbound email received via webhook
2. `ReplyProcessor.processReply()` called
3. Contact and campaign identified
4. Inbox thread created/updated
5. Reply message inserted into thread

### 2. Auto-Stop on Reply

When a reply is received, the system automatically stops future campaign sends to that contact if `auto_stop_on_reply` is enabled.

### 3. Intent Detection

Replies are automatically classified using AI to determine:
- Meeting intent
- Interest level
- Question type
- Other categories

## Dashboard Interface

### Main Inbox Page (`/dashboard/inbox`)
- List of all threads with status indicators
- Quick filters by status and assignment
- Thread preview with last message snippet
- Statistics overview

### Individual Thread Page (`/dashboard/inbox/[id]`)
- Full conversation history
- Reply composition with AI assistance
- Thread status management
- Assignment controls

## Team Features

### Assignment
- Assign threads to specific team members
- Track who's handling each conversation
- Prevent duplicate responses

### Status Management
- **Open**: Active conversations
- **Snoozed**: Temporarily paused
- **Closed**: Resolved conversations

### Collaboration
- Shared inbox view across team
- Real-time updates
- Activity tracking

## Security & Permissions

### Row Level Security (RLS)
- Users can only access threads from their workspaces
- Workspace membership required for access
- Automatic filtering by workspace

### Access Control
- Workspace members can view all threads
- Assignment controls for team coordination
- Audit trail for all actions

## Testing

Run the inbox system test:

```bash
npm run tsx scripts/test-inbox.ts
```

This will verify:
- Database connectivity
- Table accessibility
- Sample data retrieval
- API endpoint availability

## Configuration

### Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for admin operations
- `INBOUND_WEBHOOK_SECRET`: Webhook signature verification

### Webhook Setup
Configure your email provider (SES, Mailgun, Mailersend) to send inbound emails to:
- `/api/inbound` - Main inbound handler
- `/api/inbound/reply` - Legacy reply handler

## Monitoring & Analytics

### Metrics Tracked
- Total replies per workspace
- Reply categories and confidence scores
- Response times
- Thread resolution rates
- Team performance metrics

### Logging
- All inbound email processing
- Thread creation and updates
- Error handling and retries
- Performance metrics

## Future Enhancements

### Planned Features
- **Smart Routing**: AI-powered thread assignment
- **Template Responses**: Quick reply templates
- **Integration APIs**: Connect with CRM systems
- **Advanced Analytics**: Deep reply insights
- **Mobile App**: Native mobile experience

### Performance Optimizations
- Message pagination for large threads
- Real-time updates via WebSockets
- Caching for frequently accessed data
- Background processing for heavy operations

## Troubleshooting

### Common Issues

1. **Threads not appearing**
   - Check workspace membership
   - Verify contact creation
   - Review webhook delivery

2. **Messages not loading**
   - Check thread permissions
   - Verify message relationships
   - Review RLS policies

3. **Performance issues**
   - Check database indexes
   - Review query optimization
   - Monitor connection pooling

### Debug Mode
Enable detailed logging by setting:
```bash
DEBUG=inbox:*
```

## Support

For technical support or feature requests:
- Check existing issues in the repository
- Create a new issue with detailed description
- Include logs and error messages
- Provide reproduction steps 