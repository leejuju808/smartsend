# Block 257000 — SmartSend AI Office Admin Engine v1 Implementation

## Overview

This block implements a comprehensive AI-powered office administration system for roofing companies. It automates email handling, voicemail transcription, task creation, document filing, customer intake, and follow-up automation.

## Features Implemented

### 1. Database Schema ✅

**Tables Created:**
- `office_users` - Office staff members with roles and permissions
- `office_inbox` - Unified inbox for all communications (email, voicemail, SMS, webform)
- `office_tasks` - Tasks created from inbox items or manually
- `office_documents` - Documents filed by AI (contracts, invoices, permits, etc.)
- `office_activity_log` - Activity log for dashboard and tracking

**Key Features:**
- Full RLS (Row Level Security) policies
- Automatic activity logging via triggers
- Dashboard summary function
- Storage bucket for office documents

### 2. AI Email Assistant ✅

**Endpoint:** `POST /api/office-admin/email/process`

**Features:**
- Reads incoming emails
- AI categorizes (warranty_issue, new_lead, scheduling, payment, etc.)
- AI determines urgency (low, normal, high, urgent)
- AI extracts sentiment (positive, neutral, negative, frustrated)
- Auto-assigns to appropriate office staff
- Creates tasks automatically when needed
- Links to existing leads/jobs

### 3. Voicemail → Text Transcription + Auto Assignment ✅

**Endpoint:** `POST /api/office-admin/voicemail/process`

**Features:**
- Transcribes voicemail using OpenAI Whisper
- AI analyzes transcription
- Auto-assigns to appropriate staff
- Creates tasks automatically
- Generates suggested reply drafts
- Links to contacts/leads

### 4. Smart Task Creation ✅

**Endpoint:** `POST /api/office-admin/tasks/create`

**Features:**
- Creates tasks from any customer message
- AI determines task type and priority
- Auto-assigns based on task type
- Sets appropriate due dates
- Links to inbox items, leads, and jobs

**Task Types:**
- follow_up
- scheduling
- admin
- pm_task
- sales_followup
- customer_service
- general

### 5. Document Filing Engine ✅

**Endpoint:** `POST /api/office-admin/documents/upload`

**Features:**
- AI recognizes document type (contract, invoice, permit, inspection, warranty, supplement, COI, etc.)
- Extracts structured data (amounts, dates, job numbers, customer info)
- Auto-files documents in organized paths
- Links to jobs and leads
- Stores in Supabase storage bucket

**Document Types Supported:**
- contract
- invoice
- permit
- inspection
- warranty
- supplement
- coi (Certificate of Insurance)
- photo
- estimate
- other

### 6. Customer Intake Bot ✅

**Endpoint:** `POST /api/office-admin/intake`

**Features:**
- Extracts customer information from any message
- Collects: name, email, phone, address, roof type, issue description
- Determines insurance vs out-of-pocket
- Calculates lead score
- Creates/updates leads automatically
- Creates inbox entries

### 7. Follow-Up Automation ✅

**Endpoint:** `POST /api/office-admin/follow-up`

**Features:**
- Checks for messages with no response (3+ days)
- Identifies overdue tasks
- Flags tasks due soon
- Finds leads with no activity (7+ days)
- Returns actionable follow-up list

### 8. AI Response Suggestion ✅

**Endpoint:** `POST /api/office-admin/response-suggest`

**Features:**
- Generates professional response drafts
- Uses company messaging style
- Includes context (job info, customer history)
- Generates appropriate subject lines
- Saves drafts to inbox items

### 9. Office Activity Dashboard ✅

**Endpoint:** `GET /api/office-admin/dashboard`

**Features:**
- Today's office summary
- Messages received/handled/assigned
- Average response time
- Overdue and open tasks
- Documents filed
- Voicemails transcribed

## Database Migration

**File:** `supabase/migrations/20250130000002_block257000_ai_office_admin_engine_v1.sql`

Includes:
- All table definitions
- Indexes for performance
- Triggers for auto-logging
- RLS policies
- Helper functions
- Storage bucket setup

## API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/office-admin/email/process` | POST | Process incoming emails |
| `/api/office-admin/voicemail/process` | POST | Transcribe and process voicemails |
| `/api/office-admin/tasks/create` | POST | Create tasks from messages |
| `/api/office-admin/documents/upload` | POST | Upload and file documents |
| `/api/office-admin/intake` | POST | Customer intake bot |
| `/api/office-admin/follow-up` | POST | Check for follow-ups needed |
| `/api/office-admin/response-suggest` | POST | Generate response suggestions |
| `/api/office-admin/dashboard` | GET | Get dashboard summary |

## Integration Points

### With Existing Systems

1. **Leads System** - Links inbox items and tasks to leads
2. **Jobs System** - Links inbox items, tasks, and documents to jobs
3. **Contacts System** - Creates/updates contacts from voicemails/emails
4. **Voicemails Table** - Can reference existing voicemail records
5. **Roofing Companies** - All data scoped to company_id

### Office Users Setup

Office users are created from `roofing_company_members` or can be created directly. They have roles:
- office_manager
- office_staff
- admin
- scheduler
- customer_service

## Usage Examples

### Process an Email

```typescript
const response = await fetch('/api/office-admin/email/process', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    company_id: '...',
    from_email: 'customer@example.com',
    from_name: 'John Doe',
    subject: 'Leak in master bedroom',
    message: 'Water coming in above the bathroom window.',
  }),
});
```

### Process a Voicemail

```typescript
const response = await fetch('/api/office-admin/voicemail/process', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    company_id: '...',
    caller_phone: '+1234567890',
    caller_name: 'Jane Smith',
    audio_url: 'https://...',
    duration_seconds: 45,
  }),
});
```

### Upload a Document

```typescript
const formData = new FormData();
formData.append('company_id', '...');
formData.append('file', file);
formData.append('job_id', '...'); // optional

const response = await fetch('/api/office-admin/documents/upload', {
  method: 'POST',
  body: formData,
});
```

### Get Dashboard Summary

```typescript
const response = await fetch(
  `/api/office-admin/dashboard?company_id=...&date=2025-01-30`
);
const data = await response.json();
```

## AI Capabilities

All AI processing uses OpenAI GPT-4o-mini for:
- Email categorization and analysis
- Voicemail transcription (Whisper) and analysis
- Task creation from messages
- Document type recognition
- Customer information extraction
- Response generation
- Sentiment analysis
- Urgency detection

## Security

- All tables have Row Level Security (RLS) enabled
- Users can only access data for their company
- Service role has full access for system operations
- Storage bucket policies restrict access by company

## Next Steps

1. **Frontend Integration** - Create UI components for:
   - Office inbox view
   - Task management
   - Document library
   - Dashboard

2. **Webhooks** - Set up webhooks to automatically process:
   - Incoming emails (via email service)
   - Voicemails (via phone service)
   - Webform submissions

3. **Notifications** - Add real-time notifications for:
   - New inbox items
   - Overdue tasks
   - Follow-ups needed

4. **Automation Rules** - Allow companies to configure:
   - Auto-assignment rules
   - Task creation rules
   - Response templates

## Files Created

### Database
- `supabase/migrations/20250130000002_block257000_ai_office_admin_engine_v1.sql`

### API Routes
- `app/api/office-admin/email/process/route.ts`
- `app/api/office-admin/voicemail/process/route.ts`
- `app/api/office-admin/tasks/create/route.ts`
- `app/api/office-admin/documents/upload/route.ts`
- `app/api/office-admin/intake/route.ts`
- `app/api/office-admin/follow-up/route.ts`
- `app/api/office-admin/response-suggest/route.ts`
- `app/api/office-admin/dashboard/route.ts`

## Testing

To test the implementation:

1. Run the migration:
   ```bash
   supabase migration up
   ```

2. Create office users for a company

3. Test email processing:
   ```bash
   curl -X POST http://localhost:3000/api/office-admin/email/process \
     -H "Content-Type: application/json" \
     -d '{"company_id":"...","from_email":"test@example.com","message":"Test message"}'
   ```

4. Test dashboard:
   ```bash
   curl http://localhost:3000/api/office-admin/dashboard?company_id=...
   ```

## Notes

- All AI processing is async and may take a few seconds
- Document uploads are limited to 50MB
- Voicemail transcription requires audio file URL
- All timestamps are in UTC
- Company ID is required for all operations





















