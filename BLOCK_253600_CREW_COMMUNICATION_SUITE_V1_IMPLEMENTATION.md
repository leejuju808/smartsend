# Block 253600 — SmartSend Crew Communication Suite v1 Implementation

## ✅ Implementation Complete

**"Group Chat, Job Threads, AI Summaries, Voice-to-Note, Photo-to-Instruction, Supervisor Alerts"**

This block makes SmartSend the communication backbone of a roofing company. Roofing communication becomes organized, centralized, documented, and searchable.

---

## 📊 Database Schema

### Migration File
`supabase/migrations/20250130000001_block253600_crew_communication_suite_v1.sql`

### Tables Created

1. **`chat_rooms`** - Chat rooms for different communication contexts
   - Fields: id, company_id, room_type, job_id, name, description, created_by
   - Room types: `company` (whole crew), `job` (auto-created per job), `supervisor` (PM & Foremen), `safety` (Safety Manager, PM, Foremen, AI Safety Bot)
   - Indexes for performance
   - RLS policies for security

2. **`chat_room_members`** - Track who has access to which rooms
   - Fields: id, room_id, employee_id, user_id, role, joined_at
   - Roles: `member`, `admin`
   - Prevents duplicate memberships

3. **`chat_messages`** - All messages in chat rooms
   - Fields: id, room_id, employee_id, user_id, message, photo_url, audio_url
   - AI fields: ai_summary, ai_photo_note, ai_transcription, translated_message, detected_language
   - Message types: `text`, `photo`, `audio`, `system`
   - Full-text search index for message content

4. **`supervisor_alerts`** - Alerts triggered by AI or keywords
   - Fields: id, company_id, job_id, room_id, message_id, alert_type, severity, title, message, context
   - Alert types: `safety`, `delay`, `materials`, `conflict`, `quality`, `other`
   - Severity levels: `low`, `medium`, `high`, `critical`
   - Resolution tracking: resolved, resolved_at, resolved_by, resolution_notes

5. **`chat_room_summaries`** - AI-generated summaries of conversations
   - Fields: id, room_id, summary_text, summary_type, start_time, end_time, message_count
   - Summary types: `daily`, `thread`, `job_completion`
   - Key points and action items arrays

### Functions Created

- `get_or_create_company_chat(company_uuid)` - Get or create company-wide chat room
- `get_or_create_job_chat(job_uuid, company_uuid)` - Get or create job-specific chat room
- `ensure_job_chat_room(p_job_id, p_company_id, p_job_name)` - Ensure job chat room exists (called from API)
- `detect_supervisor_alert()` - Trigger function to detect alerts from messages
- `update_chat_updated_at()` - Trigger function to update timestamps

### Triggers

- `trg_chat_rooms_updated_at` - Auto-update updated_at on chat_rooms
- `trg_chat_messages_updated_at` - Auto-update updated_at on chat_messages
- `trg_supervisor_alerts_updated_at` - Auto-update updated_at on supervisor_alerts
- `trg_detect_supervisor_alert` - Auto-detect alerts when messages are inserted

---

## 🔌 API Endpoints

### Chat Messages
- **POST** `/api/crew-chat/messages` - Send a message
  - Body: `{ room_id, message, photo_url?, audio_url?, message_type? }`
  - Automatically processes: photo-to-note, voice-to-note, translation

- **GET** `/api/crew-chat/messages` - Get messages for a room
  - Query params: `room_id`, `limit?`, `offset?`

### Chat Rooms
- **GET** `/api/crew-chat/rooms` - Get rooms for user
  - Query params: `company_id`, `room_type?`, `job_id?`

- **POST** `/api/crew-chat/rooms` - Create a new room
  - Body: `{ company_id, room_type, job_id?, name, description? }`

### Job Chat Rooms
- **POST** `/api/crew-chat/jobs/auto-create-room` - Auto-create chat room for a job
  - Body: `{ job_id, company_id, job_name? }`
  - Calls `ensure_job_chat_room()` database function

### Summaries
- **POST** `/api/crew-chat/summaries` - Generate AI summary for a room
  - Body: `{ room_id, summary_type? }`
  - Generates daily or thread summaries with key points and action items

- **GET** `/api/crew-chat/summaries` - Get summaries for a room
  - Query params: `room_id`

### Supervisor Alerts
- **GET** `/api/crew-chat/alerts` - Get alerts for company
  - Query params: `company_id`, `resolved?`, `alert_type?`
  - Only accessible to owners, PMs, and foremen

- **PATCH** `/api/crew-chat/alerts` - Resolve an alert
  - Body: `{ alert_id, resolved, resolution_notes? }`

### Search
- **GET** `/api/crew-chat/search` - Search messages
  - Query params: `q` (search query), `company_id`, `room_id?`, `job_id?`, `limit?`
  - Uses PostgreSQL full-text search

---

## 🤖 AI Features

### 1. Photo-to-Note AI
When a crew member uploads a photo in chat:
- AI analyzes the photo using GPT-4 Vision
- Converts it into a structured note:
  ```
  AI Note:
  - Underlayment installed
  - Valley area
  - No wrinkles visible
  - Ready for shingles
  ```
- Stored in `chat_messages.ai_photo_note`
- Eliminates unclear messages like "yo this done?"

### 2. Voice-to-Note AI
When a worker sends a voice message:
- AI transcribes using OpenAI Whisper
- Cleans and structures the transcription:
  - Original: "hey boss uh we tore off and found like some rotten wood I think maybe 4 sheets maybe can you check"
  - AI output: "Rotten decking found. Estimated: 4 sheets. Crew requests confirmation for change order."
- Stored in `chat_messages.ai_transcription`
- Saves PMs HOURS of time

### 3. Real-Time Translation (EN ↔ Spanish)
- Automatically detects message language
- Translates English → Spanish for Spanish speakers
- Translates Spanish → English for English speakers
- Stored in `chat_messages.translated_message`
- Kills miscommunication between bilingual crews

### 4. AI Thread Summaries
- Generates daily or thread summaries
- Extracts key points and action items
- Identifies status: `on_track`, `needs_attention`, `delayed`, `completed`
- Example:
  ```
  Daily Job Summary — #1097
  - Tear-off completed
  - Found 4 sheets of rotten decking
  - Material shortage reported
  - Crew ETA for completion: 2:30 PM
  ```

### 5. Supervisor Alert System
Automatically triggers when:
- Keywords detected: "problem", "delay", "missing", "danger", "safety", "accident", "injury", "shortage", "conflict", "complaint", "issue", "broken", "damage", "emergency", "urgent", "help", "stuck", "can't", "unable"
- AI detects safety issue in photos
- Crew reports shortage
- Crew mentions homeowner conflict

Alert types:
- `safety` - Safety violations or concerns
- `delay` - Job delays or stuck situations
- `materials` - Material shortages or issues
- `conflict` - Conflicts or complaints
- `quality` - Quality concerns
- `other` - Other issues

---

## 🎨 Frontend Components

### Components Created

1. **`ChatRoom.tsx`** - Main chat interface
   - Displays messages with sender info
   - Shows AI notes, transcriptions, and translations
   - Photo and audio support
   - Real-time updates via Supabase subscriptions
   - Message input with photo upload

2. **`ChatRoomList.tsx`** - List of available chat rooms
   - Shows room type badges
   - Displays room descriptions
   - Job stage indicators
   - Click to select room

### Usage Example

```tsx
import { ChatRoom } from '@/components/crew-chat/ChatRoom'
import { ChatRoomList } from '@/components/crew-chat/ChatRoomList'

function CrewChatPage() {
  const [selectedRoom, setSelectedRoom] = useState<string>()
  
  return (
    <div className="flex">
      <div className="w-1/3">
        <ChatRoomList 
          companyId={companyId}
          onRoomSelect={setSelectedRoom}
          selectedRoomId={selectedRoom}
        />
      </div>
      <div className="w-2/3">
        {selectedRoom && (
          <ChatRoom roomId={selectedRoom} companyId={companyId} />
        )}
      </div>
    </div>
  )
}
```

---

## 🔍 Search Functionality

Full-text search across all messages:
- Search by keywords: "ridge vent problem", "material shortage", "rot decking", "change order", "customer complaint"
- Filter by room, job, or company
- Returns relevant messages with context
- Uses PostgreSQL full-text search for performance

---

## 🔔 Notification System (To Be Implemented)

Planned notifications:
- For PM: Crew arrived at job, Crew reported issue, Safety problem detected, Material shortage, Job delayed
- For Crew: New instructions, Change order approved, Permit ready, Material ETA

---

## 🚀 Integration Points

### Auto-Create Job Chat Rooms

When a job is created, call:
```typescript
await fetch('/api/crew-chat/jobs/auto-create-room', {
  method: 'POST',
  body: JSON.stringify({
    job_id: job.id,
    company_id: company.id,
    job_name: `Job #${job.id.substring(0, 8)} — Chat`
  })
})
```

This will:
1. Create a job-specific chat room
2. Auto-add foremen, PMs, and installers
3. Link the room to the job

---

## 📝 Room Types

1. **Company Chat** - Whole crew sees it
   - Announcements, morning messages, updates
   - Created via `get_or_create_company_chat()`

2. **Job Chat** - Auto-created when job is created
   - Foremen, PM, installers join automatically
   - Name format: "Job #1097 — Crestview Dr — Chat"
   - Created via `ensure_job_chat_room()`

3. **Safety Channel** - Used by Safety Manager, PM, Foremen, AI Safety Bot
   - Created manually or via API

4. **Supervisor Channel** - Private between PM & Foremen
   - Created manually or via API

---

## 🔒 Security (RLS Policies)

- Users can only see rooms for their company
- Users can only see messages in rooms they belong to
- Supervisor alerts only visible to owners, PMs, and foremen
- All policies enforce company-level access control

---

## 🎯 Key Benefits

### Before SmartSend:
❌ Texts everywhere
❌ No documentation
❌ Lost instructions
❌ Miscommunication
❌ Spanish/English confusion
❌ Too many group chats
❌ No photos attached to jobs
❌ No job-level threads
❌ PM overwhelmed
❌ Supervisors blind
❌ No record for disputes

### After SmartSend:
✔ Job-specific chat rooms
✔ Company-wide chat
✔ AI photo notes
✔ AI voice transcription
✔ AI summaries
✔ EN↔SP translation
✔ Supervisor alerts
✔ Automatically linked to jobs
✔ Searchable history
✔ Crew communication centralized

---

## 📚 Next Steps

1. **Notification System** - Implement push notifications for chat events
2. **Customer Integration** - Add homeowner chat access (optional, PM-only view)
3. **Mobile App** - Extend to mobile crew app
4. **Analytics** - Track communication patterns and response times
5. **Integrations** - Connect with scheduling, materials, and other systems

---

## 🏆 Impact

Roofers will say:
- "SmartSend replaced every group chat instantly."
- "Everything is organized by job automatically."
- "We'd be stupid not using this."
- "This killed all our WhatsApp groups."
- "Everything is finally organized."
- "SmartSend feels like a $5M company system."

This is the communication backbone of roofing operations.
























