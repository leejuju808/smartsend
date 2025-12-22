# Block 18400 — SmartSend Calendar Sync + AI Availability Logic v1

**Google Calendar Sync, Real Availability Detection, Crew-Level Scheduling, Job-Length Awareness & Auto-Blocked Times**

## Overview

Block 18400 makes SmartSend's scheduler 100% real-world accurate by syncing with roofer calendars, detecting true availability, blocking impossible slots, and injecting AI logic that understands:

- Google Calendar events
- Travel time
- Job length
- Lunch breaks
- Weather blocks
- Daylight hours
- Personal appointments
- Crew schedules
- Overlapping constraints

This ensures homeowners NEVER book a time that the roofer can't actually make.

## Architecture

### 1. Database Tables

#### `calendar_events`
Stores synced Google Calendar events for availability blocking.

**Key Fields:**
- `external_event_id` — Google Calendar event ID
- `start_time`, `end_time` — Event time window
- `busy_type` — 'free', 'busy', 'tentative', 'out_of_office'
- `auto_block_enabled` — Automatically block this time slot
- `block_type` — Type of block (busy, travel, lunch, personal, etc.)

#### `crew_availability`
Per-crew-member availability tracking for crew-level scheduling.

**Key Fields:**
- `user_id` — Crew member
- `date`, `start_time`, `end_time` — Availability window
- `status` — 'available', 'busy', 'unavailable', 'tentative'
- `source_type` — Source of unavailability (calendar_event, booking, manual_block)

#### `schedule_blocks`
Auto-blocked times (travel, lunch, breaks, calendar events, etc.).

**Key Fields:**
- `start_time`, `end_time` — Block time window
- `block_type` — Type of block
- `auto_generated` — Whether block was auto-generated
- `source_type`, `source_id` — Reference to source record

#### `route_estimates`
Enhanced travel time estimates with traffic awareness.

**Key Fields:**
- `from_address`, `to_address` — Route endpoints
- `travel_time_minutes` — Estimated travel time
- `distance_miles` — Distance
- `traffic_condition` — 'light', 'moderate', 'heavy', 'severe'
- `expires_at` — Cache expiration

### 2. Calendar Sync Worker

**Location:** `supabase/functions/calendar-sync-google/index.ts`

**Schedule:** Every 60 seconds (configurable)

**Functionality:**
- Fetches Google Calendar events for all active connections
- Syncs events from 2 days ago to 30 days ahead
- Automatically refreshes OAuth tokens
- Detects event types (busy, out-of-office, tentative)
- Creates `calendar_events` records
- Auto-generates `schedule_blocks` for busy/out-of-office events
- Updates `crew_availability` for crew-level scheduling

### 3. API Endpoints

#### `POST /api/calendar/sync`
Manually trigger calendar sync for current workspace.

**Response:**
```json
{
  "success": true,
  "message": "Calendar sync triggered",
  "result": {
    "processed": 1,
    "synced": 15,
    "deleted": 2,
    "errors": 0
  }
}
```

#### `GET /api/calendar/slots`
Get available time slots with AI availability logic.

**Query Parameters:**
- `date` (required) — Date in YYYY-MM-DD format
- `duration` (optional) — Duration in minutes (default: 30)
- `property_address` (optional) — Property address for travel time calculation
- `appointment_type` (optional) — Type of appointment
- `user_id` (optional) — For crew-level scheduling

**Response:**
```json
{
  "date": "2025-02-01",
  "duration": 30,
  "total_slots": 8,
  "slots": [
    {
      "start_time": "2025-02-01T10:00:00Z",
      "end_time": "2025-02-01T10:30:00Z",
      "quality_score": 0.95,
      "travel_time_minutes": 15,
      "weather_safe": true,
      "daylight_safe": true,
      "crew_available": true,
      "reason": "Available"
    }
  ]
}
```

#### `GET /api/calendar/suggestions`
Get smart time suggestions based on natural language query.

**Query Parameters:**
- `query` (required) — Natural language query (e.g., "tomorrow", "Wednesday", "next week")
- `duration` (optional) — Duration in minutes (default: 30)
- `property_address` (optional) — Property address
- `appointment_type` (optional) — Type of appointment
- `user_id` (optional) — For crew-level scheduling
- `max_suggestions` (optional) — Max suggestions to return (default: 3)

**Response:**
```json
{
  "query": "tomorrow",
  "duration": 30,
  "suggestions": [
    {
      "start_time": "2025-02-01T13:45:00Z",
      "end_time": "2025-02-01T14:15:00Z",
      "suggestion_reason": "Best availability Friday, February 01 at 01:45 PM (quality score: 0.92)",
      "quality_score": 0.92,
      "travel_time_minutes": 14
    }
  ]
}
```

### 4. Database Functions

#### `calculate_real_availability`
Calculates real availability with AI logic (travel, weather, daylight, crew).

**Parameters:**
- `p_workspace_id` — Workspace ID
- `p_date` — Date to check
- `p_duration` — Appointment duration in minutes
- `p_property_address` — Property address (optional)
- `p_appointment_type` — Appointment type (optional)
- `p_user_id` — User ID for crew-level scheduling (optional)

**Returns:** Table of available slots with quality scores and availability factors.

#### `get_smart_time_suggestions`
Get smart time suggestions based on natural language query.

**Parameters:**
- `p_workspace_id` — Workspace ID
- `p_query_text` — Natural language query
- `p_duration` — Duration in minutes
- `p_property_address` — Property address (optional)
- `p_appointment_type` — Appointment type (optional)
- `p_user_id` — User ID (optional)
- `p_max_suggestions` — Max suggestions (default: 3)

**Returns:** Table of suggested time slots with reasons.

#### `is_crew_member_available`
Check if crew member is available for a time slot.

**Parameters:**
- `p_workspace_id` — Workspace ID
- `p_user_id` — User ID
- `p_start_time` — Start time
- `p_end_time` — End time
- `p_exclude_booking_id` — Booking ID to exclude (optional)

**Returns:** Boolean indicating availability.

#### `sync_calendar_event_to_blocks`
Sync calendar event to schedule_blocks for auto-blocking.

**Parameters:**
- `p_calendar_event_id` — Calendar event ID

**Functionality:**
- Creates schedule_block for busy/out-of-office events
- Updates crew_availability
- Respects scheduler_settings.auto_block_calendar_events

### 5. Helper Services

#### Travel Time Calculation (`src/lib/calendar/travel-time.ts`)

**Functions:**
- `calculateTravelTime()` — Calculate travel time using Google Maps API
- `getTravelTimeWithCache()` — Get travel time from cache or calculate

**Features:**
- Traffic-aware estimates
- Caching (7-day expiration)
- Peak hour detection
- Distance calculation

#### Daylight Hours (`src/lib/calendar/daylight.ts`)

**Functions:**
- `calculateDaylightTimes()` — Calculate sunrise/sunset for a date
- `isDaylightSafe()` — Check if time slot is within daylight hours
- `getDaylightTimes()` — Get daylight times (with caching)

**Features:**
- Season-aware calculations
- Latitude adjustments
- Buffer support

## Configuration

### Scheduler Settings

Add to `scheduler_settings` table:

```sql
UPDATE scheduler_settings SET
  calendar_sync_enabled = true,
  calendar_sync_interval_seconds = 60,
  auto_block_calendar_events = true,
  auto_block_travel_time = true,
  auto_block_lunch = true,
  lunch_start_time = '12:00',
  lunch_end_time = '13:00',
  lunch_duration_minutes = 60,
  crew_level_scheduling = false,
  ai_availability_enabled = true,
  smart_time_suggestions_enabled = true,
  double_booking_prevention = true
WHERE workspace_id = 'your-workspace-id';
```

## Usage Examples

### 1. Sync Calendar Events

```typescript
// Manual sync
const response = await fetch('/api/calendar/sync', {
  method: 'POST',
});

const result = await response.json();
console.log('Synced events:', result.result.synced);
```

### 2. Get Available Slots

```typescript
const response = await fetch(
  '/api/calendar/slots?date=2025-02-01&duration=30&property_address=123 Main St'
);

const slots = await response.json();
console.log('Available slots:', slots.slots);
```

### 3. Get Smart Suggestions

```typescript
const response = await fetch(
  '/api/calendar/suggestions?query=tomorrow&duration=45&property_address=123 Main St'
);

const suggestions = await response.json();
console.log('Suggestions:', suggestions.suggestions);
```

### 4. Check Crew Availability

```sql
SELECT * FROM is_crew_member_available(
  'workspace-id',
  'user-id',
  '2025-02-01 10:00:00'::timestamptz,
  '2025-02-01 10:30:00'::timestamptz
);
```

## Features

### ✅ Google Calendar Sync
- OAuth integration
- Real-time sync (every 60 seconds)
- Automatic token refresh
- Event type detection (busy, out-of-office, tentative)
- Auto-blocking of busy times

### ✅ Real Availability Engine
- Combines calendar events, bookings, travel time, weather, daylight
- Quality scoring for each slot
- Filters impossible slots

### ✅ AI Availability Logic
- Considers job length, travel distance, weather safety
- Commute path optimization
- Overlapping crew job detection
- Blocked personal events
- Lunch break awareness
- End-of-day time limits
- Setup/breakdown time

### ✅ Auto-Blocked Times
- Existing calendar events
- Travel time windows
- Weather danger periods
- Dark hours (after sunset)
- Crew conflicts
- Lunch breaks

### ✅ Crew-Level Scheduling
- Per-person availability tracking
- Crew assignment logic
- Load balancing
- Conflict detection

### ✅ Job-Length Awareness
- Dynamic slot availability based on job type
- Default durations per appointment type
- Buffer time calculations

### ✅ Smart Time Suggestions
- Natural language query parsing
- Quality-scored suggestions
- Travel time awareness
- Best availability recommendations

### ✅ Double-Booking Prevention
- Overlapping appointment detection
- Calendar conflict checking
- Travel-time overlap prevention
- Same rep double-booking prevention
- Lunch break protection

## Environment Variables

Required environment variables:

```bash
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_MAPS_API_KEY=your-google-maps-api-key
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Migration

Run the migration:

```bash
supabase migration up 20250130000005_block18400_calendar_sync_ai_availability
```

## Testing

### Test Calendar Sync

1. Connect Google Calendar via `/api/calendar/google/authorize`
2. Wait for automatic sync (60 seconds) or trigger manually via `/api/calendar/sync`
3. Check `calendar_events` table for synced events
4. Verify `schedule_blocks` are created for busy events

### Test Availability Calculation

```sql
SELECT * FROM calculate_real_availability(
  'workspace-id',
  '2025-02-01'::date,
  30,
  '123 Main St, City, State',
  'roof_inspection',
  NULL
);
```

### Test Smart Suggestions

```sql
SELECT * FROM get_smart_time_suggestions(
  'workspace-id',
  'tomorrow',
  30,
  '123 Main St',
  'roof_inspection',
  NULL,
  3
);
```

## Future Enhancements

- [ ] Outlook Calendar sync support
- [ ] Multi-calendar support per user
- [ ] Advanced NLP for time suggestions
- [ ] Machine learning for quality score optimization
- [ ] Real-time traffic updates
- [ ] Weather API integration
- [ ] Sunrise/sunset API integration
- [ ] Route optimization for multiple appointments
- [ ] Mobile app support
- [ ] Calendar event creation from bookings

## Support

For issues or questions, contact the SmartSend team.





















































