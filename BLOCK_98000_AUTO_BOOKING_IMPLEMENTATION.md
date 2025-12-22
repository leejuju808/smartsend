# Block 98000 — SmartSend Auto-Booking Engine v1

**"Auto-Booking Engine + AI Scheduling Assistant"**

## ✅ Implementation Complete

This block transforms SmartSend from "I help you get replies" to "I book you appointments automatically" — the exact feature that makes roofers feel:

> "SmartSend literally booked jobs for me while I was on a roof. I am an absolute idiot if I don't use this."

---

## 📦 What Was Built

### 1. Database Schema (`supabase/migrations/20250230000000_block98000_auto_booking_system.sql`)

#### `appointments` Table
- Stores all scheduled appointments/estimates
- Links to `leads` table
- Tracks homeowner contact info, date/time, status
- Supports statuses: `scheduled`, `completed`, `cancelled`, `rescheduled`
- Includes `confirmation_sent` flag for tracking

#### `user_availability` Table
- Stores user availability windows by weekday (1=Mon ... 7=Sun)
- Each user can set start/end times per day
- Default seed: Mon-Sat, 9 AM - 5 PM

#### Helper Functions
- `seed_default_availability(user_id)` - Seeds default Mon-Sat 9-5 availability
- `get_next_available_slot(user_id, days_ahead)` - Finds next available appointment slot

### 2. Edge Function (`supabase/functions/autoBookAppointment/index.ts`)

**Purpose**: Automatically books appointments when homeowner replies show booking intent.

**Flow**:
1. Detects booking intent using GPT-4o-mini
2. Fetches user availability (seeds default if none exists)
3. Finds next available time slot (avoids conflicts)
4. Creates appointment record
5. Sends notification to roofer
6. Returns confirmation message for one-click send

**Input**:
```json
{
  "user_id": "uuid",
  "message": "Homeowner reply text",
  "lead_id": "uuid (optional)",
  "homeowner_name": "string (optional)",
  "address": "string (optional)",
  "homeowner_email": "string (optional)",
  "homeowner_phone": "string (optional)"
}
```

**Output**:
```json
{
  "booked": true,
  "appointment": {
    "id": "uuid",
    "date": "YYYY-MM-DD",
    "time": "9:00 AM",
    "homeowner_name": "string",
    "homeowner_address": "string"
  },
  "confirmation_message": "Pre-generated message for homeowner"
}
```

### 3. Appointments UI (`src/app/appointments/page.tsx` + `AppointmentsList.tsx`)

**Features**:
- Beautiful, modern UI with grouped appointments by date
- Shows "Today", "Tomorrow", or full date labels
- Displays homeowner name, address, email, phone
- One-click "Get Message" button to generate confirmation
- One-click "Send Confirmation" button
- "Mark Completed" and "Cancel" actions
- Empty state with helpful messaging

**Layout**:
- Responsive grid (1 column mobile, 2 tablet, 3 desktop)
- Card-based design with hover effects
- Status badges
- Clear visual hierarchy

### 4. API Routes

#### `/api/appointments/[id]/complete`
Marks an appointment as completed.

#### `/api/appointments/[id]/cancel`
Cancels an appointment.

#### `/api/appointments/[id]/confirmation`
Returns pre-generated confirmation message for an appointment.

#### `/api/appointments/[id]/send-confirmation`
Queues confirmation message for sending (integrate with your email system).

#### `/api/appointments/auto-book`
Proxy route that calls the auto-booking edge function from Next.js.

### 5. Integration with Reply Detection

**Modified**: `src/app/api/followup-brain-v2/detect/route.ts`

**Changes**:
- Detects booking keywords in replies
- Automatically calls auto-booking API when booking intent is detected
- Non-blocking (doesn't fail if auto-booking fails)
- Logs `auto_booking_attempted` in actions_taken array

**Booking Keywords Detected**:
- schedule, appointment, estimate, inspection, visit
- come by, available, when can, book

---

## 🚀 Deployment Steps

### 1. Apply Database Migration

```bash
# Via Supabase CLI
supabase db push

# Or manually in Supabase SQL Editor
# Run: supabase/migrations/20250230000000_block98000_auto_booking_system.sql
```

### 2. Deploy Edge Function

```bash
cd supabase
supabase functions deploy autoBookAppointment
```

### 3. Set Environment Variables

In Supabase Dashboard → Edge Functions → Settings:

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- `OPENAI_API_KEY` - Your OpenAI API key

### 4. Test the System

1. **Set Availability** (optional - defaults to Mon-Sat 9-5):
   ```sql
   INSERT INTO user_availability (user_id, weekday, start_time, end_time)
   VALUES 
     ('your-user-id', 1, '9:00 AM', '5:00 PM'),
     ('your-user-id', 2, '9:00 AM', '5:00 PM');
     -- etc.
   ```

2. **Test Auto-Booking**:
   - Send a test reply with booking intent
   - Check `/appointments` page for new appointment
   - Verify notification was created

3. **Test UI**:
   - Visit `/appointments`
   - Click "Get Message" on an appointment
   - Click "Send Confirmation"
   - Mark an appointment as completed

---

## 💡 How It Works

### Automatic Booking Flow

1. Homeowner replies: *"Yes, I'd like to schedule an estimate for next week"*
2. Reply detection runs → detects booking keywords
3. Auto-booking edge function is called
4. AI confirms booking intent (confidence ≥ 0.7)
5. System finds next available slot (Mon-Sat 9-5 by default)
6. Appointment is created in database
7. Notification sent to roofer: *"New Appointment Booked - Estimate on [date] at [time]"*
8. Roofer visits `/appointments`, sees new booking
9. Roofer clicks "Get Message" → sees pre-generated confirmation
10. Roofer clicks "Send Confirmation" → message sent to homeowner

### Why This Makes Roofers Feel Stupid Not Using SmartSend

1. **24/7 Booking**: SmartSend books jobs while roofers are on a roof, driving, or sleeping
2. **Zero Friction**: No manual scheduling, no missed opportunities
3. **Fast Response**: Beats competitors who take hours/days to reply
4. **No Payroll**: Acts like a receptionist but better (no time-off, no mistakes)

---

## 🔧 Customization

### Adjust Availability

```sql
-- Update user availability
UPDATE user_availability
SET start_time = '8:00 AM', end_time = '6:00 PM'
WHERE user_id = 'your-user-id' AND weekday = 1;
```

### Customize Booking Detection

Edit `src/app/api/followup-brain-v2/detect/route.ts` to adjust booking keywords:

```typescript
const bookingKeywords = ['schedule', 'appointment', 'estimate', /* add more */];
```

### Customize Confirmation Message

Edit the confirmation message template in:
- Edge function: `supabase/functions/autoBookAppointment/index.ts`
- API route: `src/app/api/appointments/[id]/confirmation/route.ts`

---

## 📊 Database Tables

### `appointments`
- `id` (uuid, PK)
- `user_id` (uuid, FK → auth.users)
- `lead_id` (uuid, FK → leads, nullable)
- `homeowner_name`, `homeowner_address`, `homeowner_email`, `homeowner_phone`
- `date` (date)
- `time` (text, e.g., "9:00 AM")
- `notes` (text)
- `status` (text: scheduled|completed|cancelled|rescheduled)
- `confirmation_sent` (boolean)
- `created_at`, `updated_at`

### `user_availability`
- `id` (uuid, PK)
- `user_id` (uuid, FK → auth.users)
- `weekday` (int: 1-7, 1=Mon, 7=Sun)
- `start_time` (text, e.g., "9:00 AM")
- `end_time` (text, e.g., "5:00 PM")
- `created_at`, `updated_at`

---

## 🎯 Next Steps (Future Enhancements)

1. **Calendar Integration**: Sync appointments to Google Calendar/Outlook
2. **Map Integration**: Show appointments on map view
3. **Text Notifications**: SMS reminders to roofers
4. **Rescheduling**: Allow homeowners to reschedule via link
5. **Buffer Times**: Add travel time buffers between appointments
6. **Recurring Availability**: More complex availability rules (time zones, holidays)

---

## ✅ Completion Checklist

- [x] Database migration created
- [x] Appointments table with RLS
- [x] User availability table with default seed
- [x] Auto-booking edge function
- [x] Appointments UI page
- [x] API routes for appointment management
- [x] Confirmation message generation
- [x] Integration with reply detection flow
- [x] One-click confirmation sending
- [x] Notification system integration

---

**This is the MONEY BLOCK. This feature alone makes SmartSend worth $199–$399/mo.**


























