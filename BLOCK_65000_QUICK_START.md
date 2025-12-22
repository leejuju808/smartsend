# Block 65000 — Homeowner Experience Portal v2 Quick Start

## 🚀 Quick Setup Guide

### 1. Run Database Migration

```bash
# Apply the migration
npx supabase migration up
```

The migration file is located at:
```
supabase/migrations/20250205000000_block65000_homeowner_experience_portal_v2.sql
```

### 2. Access the Portal

Homeowners can access their portal at:
```
/homeowner/[token]/v2
```

The token is generated when creating a homeowner portal session (existing Block 44000/38900 system).

### 3. Adding Photos to Feed

When crew uploads photos, call:
```typescript
POST /api/homeowner/feed/add-photo
{
  "job_id": "uuid",
  "photo_url": "https://...",
  "caption": "Optional caption",
  "photo_type": "before" | "during" | "after",
  "uploaded_by_crew": true
}
```

### 4. Updating Milestones

Update job milestones as work progresses:
```typescript
POST /api/homeowner/milestone/update
{
  "job_id": "uuid",
  "milestone": "Material delivery",
  "status": "completed"
}
```

Available milestones:
- Material delivery
- Tear-off started
- Tear-off completed
- Decking repair
- Underlayment installed
- Shingles installed
- Ridge installed
- Final QC completed
- Clean-up completed

### 5. Tracking Crew Location

When crew clocks in/out, call:
```typescript
POST /api/homeowner/crew/location
{
  "job_id": "uuid",
  "crew_member_id": "uuid",
  "location_type": "en_route" | "on_site" | "left_site",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "address": "123 Main St"
}
```

This automatically sends notifications to homeowners!

### 6. Sending Notifications

Send event-based notifications:
```typescript
POST /api/homeowner/notifications/send
{
  "job_id": "uuid",
  "type": "crew_arrived" | "material_delivered" | "milestone_reached" | ...,
  "message": "Your crew has arrived!",
  "sent_via": "both" // "sms" | "email" | "both"
}
```

### 7. Getting Portal Data

Fetch all portal data for a homeowner:
```typescript
GET /api/homeowner/portal-data?token=[token]
```

Returns:
- Job info
- Photos
- Milestones
- Crew status
- Notifications
- Messages

---

## 🎯 Integration Examples

### Crew App Photo Upload

```typescript
// When crew uploads photo
const response = await fetch('/api/homeowner/feed/add-photo', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    job_id: jobId,
    photo_url: photoUrl,
    caption: 'Roof before installation',
    photo_type: 'before',
    uploaded_by_crew: true
  })
});
```

### Crew Clock In

```typescript
// When crew clocks in
const position = await navigator.geolocation.getCurrentPosition();

await fetch('/api/homeowner/crew/location', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    job_id: jobId,
    crew_member_id: memberId,
    location_type: 'on_site',
    latitude: position.coords.latitude,
    longitude: position.coords.longitude
  })
});
```

### Milestone Completion

```typescript
// When milestone is completed
await fetch('/api/homeowner/milestone/update', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    job_id: jobId,
    milestone: 'Shingles installed',
    status: 'completed'
  })
});
```

---

## 📱 Homeowner Features

### Live Job Map
- Shows crew location in real-time
- GPS tracking integration
- Crew status indicators

### Daily Photo Feed
- Instagram-style layout
- Grouped by date
- Before/during/after categories

### Milestone Tracker
- Visual progress bar
- Checkmarks for completed items
- Completion dates

### Notifications
- Event-based alerts
- Unread indicators
- Color-coded by type

### Ask a Question
- Direct messaging to office
- Message history
- Real-time updates

### Satisfaction Pulse
- Quick feedback buttons
- Auto-creates service tickets
- Prevents complaints

---

## 🔧 Configuration

### Auto-Refresh
Portal auto-refreshes every 30 seconds to show latest updates.

### Notifications
Currently creates notification records. To send actual SMS/Email:
1. Integrate with Twilio/Vonage for SMS
2. Integrate with Resend/SendGrid for email
3. Update `/api/homeowner/notifications/send` route

### Service Tickets
When homeowner reports concern, service ticket is auto-created (if `service_tickets` table exists).

---

## 🎨 Customization

All components are in:
```
app/homeowner/[token]/components/v2/
```

Customize:
- Colors and styling
- Milestone names
- Notification messages
- Layout arrangement

---

## ✅ Testing Checklist

- [ ] Database migration applied
- [ ] Portal accessible at `/homeowner/[token]/v2`
- [ ] Photos appear in feed
- [ ] Milestones update correctly
- [ ] Crew location tracking works
- [ ] Notifications are created
- [ ] Chat messages send
- [ ] Satisfaction pulse creates tickets
- [ ] Auto-refresh works
- [ ] Mobile responsive

---

## 🚨 Troubleshooting

### Portal not loading?
- Check token is valid and not expired
- Verify job_id exists in database
- Check browser console for errors

### Photos not appearing?
- Verify photo_url is accessible
- Check `homeowner_photo_feed` table
- Ensure job_id matches

### Crew location not updating?
- Verify GPS coordinates are valid
- Check `crew_location_tracking` table
- Ensure job_id matches

### Notifications not sending?
- Check notification records in database
- Verify homeowner email/phone exists
- Integrate SMS/Email service for actual delivery

---

**Ready to transform homeowner communication! 🎉**




























