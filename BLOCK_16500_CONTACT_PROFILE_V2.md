# Block 16500 — SmartSend Contact Profile v2

## Overview

The Contact Profile v2 is a comprehensive, all-in-one command center for roofers to manage homeowner contacts. It provides everything needed to understand, engage with, and close leads in a single, powerful interface.

## Architecture

### Layout Structure

The profile is organized into 4 major sections:

1. **Left Panel (3 columns)** — Homeowner Snapshot
   - Large, contractor-friendly display
   - Name, Address, Neighborhood, City/Zip
   - Phone + Email with copy functionality
   - Tags display

2. **Middle Panel (6 columns)** — Conversation + AI Intelligence
   - Full Inbox Thread (emails → replies → follow-ups)
   - AI Summary Box with comprehensive insights
   - AI-Assisted Note Writing
   - Bottom Panel: Files, Notes, Photos & Timeline

3. **Right Panel (3 columns)** — Intelligence Modules
   - Lead Heat Score (0-100)
   - Storm Impact Box
   - Insurance Signals Box
   - Job Value Box
   - Pipeline Stage
   - Tasks for this Homeowner

4. **Top Bar** — One-Click Action Buttons
   - Send Email
   - Book Appointment
   - Suggested Replies (AI)
   - Upload Photos
   - Add Quote
   - Move to HOT

## Components Created

### Core Components

1. **`HomeownerSnapshot.tsx`** — Left panel snapshot component
   - Displays contact info in large, readable format
   - Copy-to-clipboard functionality
   - Tags display

2. **`AISummaryBox.tsx`** — AI-powered summary
   - Intent, tone, job type
   - Storm impact details
   - Insurance likelihood
   - Next recommended action
   - Heat score & close probability
   - Appointment status
   - Revenue estimate

3. **`IntelligenceModules.tsx`** — Right panel intelligence
   - Heat Score display with visual indicators
   - Storm Impact Box
   - Insurance Signals Box
   - Job Value Box
   - Pipeline Stage
   - Tasks list

4. **`OneClickActions.tsx`** — Action buttons bar
   - All major actions in one place
   - Modal dialogs for email and quote
   - AI reply generation
   - Photo upload

5. **`InsuranceToolkit.tsx`** — Conditional insurance panel
   - Appears when insurance likelihood is high
   - Adjuster prep checklist
   - Insurance-specific templates
   - Recommended timelines
   - Claim follow-up tasks

6. **`ConversationThread.tsx`** — Full inbox thread view
   - Displays all emails and replies
   - Threaded conversation view
   - Visual distinction between sent/received

7. **`AIAssistedNote.tsx`** — Smart note writing
   - Auto-expands short notes using AI
   - Saves expanded notes with metadata
   - Time-stamped notes

8. **`VisualBadges.tsx`** — Color-coded badges
   - Red → HOT
   - Purple → Insurance
   - Blue → Storm
   - Green → Quote
   - Teal → Appointment
   - Gray → Not Interested

## API Endpoints

### Main Endpoint

- **`GET /api/contacts/[id]/full`** — Comprehensive data endpoint
  - Returns all contact data, heat scores, insurance metadata, weather events, tasks, files, timeline, threads, and AI summary

### Supporting Endpoints

- **`POST /api/contacts/[id]/expand-note`** — AI note expansion
- **`POST /api/contacts/[id]/send-email`** — Send email to contact
- **`POST /api/contacts/[id]/ai-replies`** — Generate AI reply suggestions

## Database Tables Used

- `contacts` — Main contact data
- `contact_enrichment` — Enriched property data
- `lead_heat_scores` — Heat score calculations
- `insurance_metadata` — Insurance claim information
- `weather_events` — Storm history
- `tasks` — Task management
- `attachments` — Files and photos
- `contact_timeline` — Activity timeline
- `inbox_threads` — Email threads
- `inbox_messages` — Individual messages

## Usage

### Accessing the v2 Profile

Navigate to: `/contacts/[contactId]/v2`

### Features

1. **One-Click Actions** — All major actions accessible from the top bar
2. **AI Summary** — Instant understanding of lead status and next steps
3. **Intelligence Modules** — Key metrics at a glance
4. **Full Conversation View** — Complete email history
5. **Smart Note Writing** — AI expands short notes automatically
6. **Insurance Toolkit** — Specialized tools for insurance jobs
7. **Visual Indicators** — Color-coded badges for quick scanning

## Visual Design

- **Color Scheme:**
  - Red: HOT leads
  - Purple: Insurance opportunities
  - Blue: Storm-related
  - Green: Quotes/high-value
  - Teal: Appointments
  - Gray: Not interested

- **Layout:**
  - Responsive 3-column grid (3-6-3 on desktop)
  - Clean, contractor-friendly design
  - Large, readable text
  - Clear visual hierarchy

## Next Steps

1. **AI Integration** — Connect AI endpoints to actual AI services (OpenAI, etc.)
2. **Email Sending** — Integrate with email sending system
3. **Scheduler Integration** — Connect appointment booking
4. **File Upload** — Enhance file upload with progress indicators
5. **Real-time Updates** — Add WebSocket support for live updates
6. **Mobile Optimization** — Enhance mobile responsiveness

## Benefits for Roofers

🔥 **Everything in ONE place** — No clicking around  
🔥 **AI tells them exactly where the job stands** — Saves hours of guessing  
🔥 **Storm + insurance signals** — Instant opportunity clarity  
🔥 **Quote + job value + pipeline stage** — Perfect sales workflow  
🔥 **Upload photos + files** — Real roofing behavior  
🔥 **True command center** — Professional, modern, elite

## Files Created

```
app/
  api/contacts/[id]/
    full/route.ts
    expand-note/route.ts
    send-email/route.ts
    ai-replies/route.ts
  contacts/[contactId]/
    v2/page.tsx

components/contacts/v2/
  AISummaryBox.tsx
  AIAssistedNote.tsx
  ConversationThread.tsx
  HomeownerSnapshot.tsx
  InsuranceToolkit.tsx
  IntelligenceModules.tsx
  OneClickActions.tsx
  VisualBadges.tsx
```

## Testing

To test the v2 profile:

1. Navigate to a contact page: `/contacts/[contactId]/v2`
2. Verify all panels load correctly
3. Test one-click actions
4. Test AI note expansion
5. Verify visual badges display correctly
6. Test insurance toolkit (when applicable)

## Notes

- The v2 profile is available at `/contacts/[contactId]/v2`
- The original profile remains at `/contacts/[contactId]`
- All components are fully typed with TypeScript
- All components follow the existing design system
- Error handling is included throughout





















































