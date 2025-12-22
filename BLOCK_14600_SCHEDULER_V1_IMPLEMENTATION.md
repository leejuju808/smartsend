# Block 14600 — SmartSend Scheduler v1 Implementation

## ✅ Implementation Complete

Simple Contractor-Friendly Calendar for Booking Roof Inspections & Estimates FAST.

## 📦 What Was Implemented

### 1. Database Migration ✅
**File**: `supabase/migrations/20250130000002_block14600_scheduler_v1.sql`

**Tables Created:**
- `schedule_availability` - Availability settings per workspace
- `schedule_blocked_days` - Holidays/busy days
- `schedule_bookings` - Actual appointments
- `schedule_appointment_types` - Appointment type configurations

**Key Features:**
- Business hours per day of week (Mon-Sun)
- Time between appointments (15-90 min, default: 30)
- Max appointments per day (1-10, default: 3)
- Default appointment duration (30/45/60/90 min)
- Company slug for public booking pages
- Double-booking prevention via PostgreSQL EXCLUDE constraint
- Auto-creates default appointment types for new workspaces

**Functions:**
- `get_available_time_slots()` - Returns available time slots for a date
- `create_appointment_booking()` - Creates booking and syncs with contacts/pipeline

**Contact Fields Added:**
- `last_appointment_at` - Last appointment timestamp
- `next_appointment_at` - Next appointment timestamp
- `total_appointments` - Total appointment count

### 2. API Endpoints ✅

#### Authenticated Endpoints (Roofer View)

**GET `/api/scheduler/availability`**
- Get available time slots for a date
- Query params: `date` (YYYY-MM-DD), `duration` (minutes)

**POST `/api/scheduler/book`**
- Book an appointment (authenticated)
- Body: `appointment_type`, `start_time`, `homeowner_name`, `homeowner_email`, `homeowner_phone`, `property_address`, `notes`

**POST `/api/scheduler/cancel`**
- Cancel an appointment
- Body: `booking_id`, `reason`

**GET `/api/scheduler/me`**
- Get roofer's schedule (bookings)
- Query params: `start_date`, `end_date`, `status`

**GET/POST `/api/scheduler/settings`**
- Get/update availability settings

**GET/POST/DELETE `/api/scheduler/blocked-days`**
- Manage blocked days (holidays, busy days)

#### Public Endpoints (Homeowner View)

**GET `/api/public/schedule/[company]`**
- Get public booking page info by company slug
- Returns: company info, appointment types, settings

**GET `/api/public/schedule/[company]/availability`**
- Get available time slots (public, no auth)

**POST `/api/public/schedule/[company]`**
- Book an appointment (public, no auth)
- Same body as authenticated book endpoint

### 3. UI Pages (To Be Implemented)

**`/app/(app)/scheduler/page.tsx`** - Roofer scheduler dashboard
- Calendar views (daily/weekly/monthly)
- Availability settings
- Booked appointments list
- Blocked days management

**`/app/schedule/[company]/page.tsx`** - Public booking page
- Company logo/intro
- Appointment type selection
- Date/time picker
- Booking form (name, email, phone, address)
- Confirmation page

### 4. Integration Points (To Be Implemented)

**Auto-Reply Detection**
- Detect scheduling requests in inbox replies
- Auto-insert booking link in response

**Pipeline Sync**
- Update lead status to HOT on booking
- Create task: "Prepare for inspection"
- Add timeline event: "Appointment Booked"

**Email Notifications**
- Confirmation email to homeowner
- Notification email to roofer
- Reminder email 24h before appointment

**Reminder Worker**
- Cron job to send appointment reminders
- Runs daily, checks for appointments 24h ahead

## 🚀 Usage Examples

### Setting Up Availability

```typescript
// POST /api/scheduler/settings
{
  monday_enabled: true,
  monday_start: "08:00",
  monday_end: "18:00",
  time_between_appointments: 30,
  max_appointments_per_day: 3,
  default_appointment_duration: 30,
  company_slug: "abc-roofing",
  company_name: "ABC Roofing",
  booking_intro_text: "Book your free roof inspection below."
}
```

### Booking an Appointment

```typescript
// POST /api/public/schedule/abc-roofing
{
  appointment_type: "roof_inspection",
  start_time: "2025-02-15T14:00:00Z",
  homeowner_name: "John Smith",
  homeowner_email: "john@example.com",
  homeowner_phone: "555-123-4567",
  property_address: "123 Main St, Austin, TX 78701",
  notes: "Leak in master bedroom"
}
```

### Getting Available Slots

```typescript
// GET /api/public/schedule/abc-roofing/availability?date=2025-02-15&duration=30
{
  company: "abc-roofing",
  date: "2025-02-15",
  duration: 30,
  slots: [
    { start_time: "2025-02-15T08:00:00Z", end_time: "2025-02-15T08:30:00Z" },
    { start_time: "2025-02-15T08:30:00Z", end_time: "2025-02-15T09:00:00Z" },
    // ...
  ]
}
```

## 📋 Next Steps

1. **Create UI Pages**
   - Scheduler dashboard (`/scheduler`)
   - Public booking page (`/schedule/[company]`)

2. **Integrate with Inbox**
   - Auto-detect scheduling requests
   - Auto-reply with booking link

3. **Pipeline Integration**
   - Update lead status on booking
   - Create tasks automatically
   - Add timeline events

4. **Email Notifications**
   - Confirmation emails
   - Reminder emails
   - Calendar invites

5. **Reminder Worker**
   - Daily cron job
   - Send reminders 24h before appointments

## 🎯 Key Features

✅ No double booking (database constraint)
✅ Simple availability settings
✅ Public booking pages (no login required)
✅ Auto-sync with contacts/pipeline
✅ Appointment type configurations
✅ Blocked days support
✅ Time slot generation based on business hours

## 🔧 Technical Notes

- Uses PostgreSQL EXCLUDE constraint for double-booking prevention
- RLS policies ensure workspace isolation
- Public endpoints use service role client (no auth required)
- Database functions handle complex logic (time slot generation, booking creation)
- Auto-creates default appointment types for new workspaces





















































