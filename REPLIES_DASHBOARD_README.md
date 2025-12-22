# Replies Dashboard

A comprehensive dashboard for tracking inbound email replies and booking meetings through AI-powered intent detection.

## Features

- **Reply Tracking**: View all inbound replies with sender, subject, snippet, and timestamp
- **AI Booking**: One-click "Book (AI)" button that uses AI to detect meeting intent
- **Manual Booking**: "Mark Booked" button for manual meeting creation
- **Search**: Filter replies by email, subject, or message content
- **Status Tracking**: Visual status indicators (Pending/Booked)
- **Calendly Integration**: Direct links to Calendly booking pages

## Files Created

- `src/app/dashboard/replies/page.tsx` - Main dashboard component
- `src/app/dashboard/replies/replies-actions.ts` - Server actions for booking
- `src/app/api/replies-feed/route.ts` - API endpoint for replies data
- `supabase/migrations/20250127_replies_dashboard_schema.sql` - Database schema

## Setup

1. **Apply Database Migration**:
   ```sql
   -- Run the SQL in supabase/migrations/20250127_replies_dashboard_schema.sql
   ```

2. **Environment Variables**:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   OPENAI_API_KEY=your_openai_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

3. **Start Development Server**:
   ```bash
   npm run dev
   ```

4. **Access Dashboard**:
   Visit `http://localhost:3000/dashboard/replies`

## Testing

Run the test script to verify setup:
```bash
./test-replies-dashboard.sh
```

## Database Schema

The feature uses:
- `messages` table for storing inbound replies
- `meetings` table for tracking booked meetings
- `replies_with_meetings` view for joining data

## API Endpoints

- `GET /api/replies-feed` - Fetch replies with meeting status
- `POST /api/reply-intent` - AI-powered meeting intent detection

## Usage

1. **View Replies**: The dashboard automatically loads the latest 200 inbound replies
2. **Search**: Use the search bar to filter by email, subject, or content
3. **Book with AI**: Click "Book (AI)" to automatically detect meeting intent and create a meeting
4. **Manual Booking**: Click "Mark Booked" to manually create a meeting without AI analysis
5. **Access Calendly**: Click "Open Calendly" to view the booking page

## Metrics Impact

This dashboard directly improves the **Meetings Booked per 100 Replies (MB/100)** metric by:
- Making reply tracking visible and actionable
- Providing one-click booking options
- Reducing friction in the meeting booking process
- Enabling faster response to meeting requests