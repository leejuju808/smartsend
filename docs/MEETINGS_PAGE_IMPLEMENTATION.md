# Meetings Page Implementation

## Overview

The meetings page provides a comprehensive view of all meetings for a user, with filtering, status badges, and integration with Calendly webhooks.

## Features

### ✅ Status Badges
- **Proposed**: Yellow badge for meetings that are pending confirmation
- **Booked**: Green badge for confirmed meetings
- **Declined**: Gray badge for declined meetings  
- **Canceled**: Red badge for canceled meetings

### ✅ Meeting Information Display
- Contact email and subject
- Formatted date/time range (e.g., "Mon, Jan 15, 2:00 PM–2:30 PM")
- Location information
- Booking timestamp for confirmed meetings
- External source tracking

### ✅ Calendly Integration
- Calendly booking page links
- Event and invitee URIs from webhooks
- Automatic status updates via webhook
- External source identification

### ✅ Filtering & Controls
- Dropdown filter by status (All, Proposed, Booked, Declined, Canceled)
- Refresh button with loading states
- Real-time data updates

## Database Schema

The meetings table includes these fields:

```sql
-- Core fields
id uuid primary key
user_id uuid references auth.users(id)
contact_email text
thread_id text
subject text
start_at timestamptz
end_at timestamptz
status text check (status in ('proposed','booked','declined','canceled'))
calendly_link text
ics text
location text
created_at timestamptz

-- Webhook integration fields
external_source text
external_event_id text
invitee_uri text
event_uri text
booked_at timestamptz
```

## API Endpoints

### GET /api/meetings
Lists meetings for a user with optional filtering.

**Query Parameters:**
- `user_id` (required): The user's ID

**Response:**
```json
{
  "rows": [
    {
      "id": "uuid",
      "contact_email": "user@example.com",
      "subject": "Intro Call",
      "start_at": "2024-01-15T14:00:00Z",
      "end_at": "2024-01-15T14:30:00Z",
      "status": "booked",
      "booked_at": "2024-01-15T10:00:00Z",
      "location": "Zoom",
      "external_source": "calendly"
    }
  ]
}
```

### POST /api/meetings/book
Marks a meeting as booked (requires internal webhook secret).

**Request Body:**
```json
{
  "meetingId": "uuid"
}
```

**Headers:**
- `Authorization: Bearer <INTERNAL_WEBHOOK_SECRET>`
- Or query parameter: `?secret=<INTERNAL_WEBHOOK_SECRET>`

### POST /api/meetings/calendly-webhook
Handles Calendly webhook events for automatic meeting updates.

**Supported Events:**
- `invitee.created` / `invitee.updated`: Updates meeting status to booked
- `invitee.canceled`: Updates meeting status to canceled

## Development Setup

### 1. Run Database Migration
```bash
# Apply the new meeting fields migration
supabase db push
```

### 2. Set Environment Variables
```bash
# For internal webhook authentication
INTERNAL_WEBHOOK_SECRET=your-secret-here

# For Calendly webhook verification (if needed)
CALENDLY_WEBHOOK_SECRET=your-calendly-secret
```

### 3. Test the Implementation
```bash
# Run the test script
pnpm tsx scripts/test-meetings-page.ts

# Start the dev server
pnpm dev
```

### 4. Access the Page
Navigate to `/dashboard/meetings` and set your user ID in DevTools:
```javascript
localStorage.setItem('ss_user_id', '<your-auth-user-id>');
location.reload();
```

## Calendly Webhook Configuration

To enable automatic meeting updates:

1. **Configure Calendly Webhook:**
   - URL: `https://yourdomain.com/api/meetings/calendly-webhook`
   - Events: `invitee.created`, `invitee.updated`, `invitee.canceled`

2. **Webhook Payload Example:**
   ```json
   {
     "event": "invitee.created",
     "payload": {
       "invitee": {
         "uri": "https://api.calendly.com/invitees/abc123",
         "start_time": "2024-01-15T14:00:00Z",
         "end_time": "2024-01-15T14:30:00Z",
         "email": "user@example.com",
         "name": "John Doe"
       },
       "event": {
         "uri": "https://api.calendly.com/events/def456",
         "uuid": "event-uuid",
         "location": { "location": "Zoom" }
       }
     }
   }
   ```

## Testing

### Manual Testing
1. Create a meeting via the API or database
2. Update meeting status using `/api/meetings/book`
3. Verify status badge changes and displays correctly
4. Test filtering by different statuses
5. Verify Calendly webhook integration

### Automated Testing
Run the test suite:
```bash
pnpm test:unit
pnpm test:e2e
```

## Future Enhancements

- [ ] Meeting creation form
- [ ] Calendar view integration
- [ ] Email notifications for status changes
- [ ] Meeting templates
- [ ] Recurring meeting support
- [ ] Integration with other calendar providers (Google Calendar, Outlook)

## Troubleshooting

### Common Issues

1. **Meetings not loading:**
   - Check if `ss_user_id` is set in localStorage
   - Verify the user has meetings in the database
   - Check browser console for API errors

2. **Status badges not updating:**
   - Ensure the database migration has been applied
   - Check webhook endpoint logs
   - Verify webhook secret configuration

3. **Calendly links not working:**
   - Check if `calendly_link` field is populated
   - Verify Calendly webhook is configured correctly
   - Check webhook endpoint response codes

### Debug Mode
Enable debug logging by setting:
```bash
DEBUG=meetings:*
```

## Contributing

When adding new features to the meetings page:

1. Update the `Meeting` interface in `src/types/meetings.ts`
2. Add corresponding database fields if needed
3. Update the UI components to display new information
4. Add appropriate tests
5. Update this documentation 