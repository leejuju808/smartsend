# Block 34044 — SmartSend Roofing "AI Crew Dispatch + Install Day Coordination Engine" v1 Implementation

## ✅ Implementation Complete

This document summarizes the implementation of Block 34044 - SmartSend Roofing "AI Crew Dispatch + Install Day Coordination Engine" v1, which transforms SmartSend from a CRM into a full roofing operations system.

## 📦 What Was Implemented

### 1. Database Schema (`supabase/migrations/20250131000000_block34044_crew_dispatch_install_day_coordination_v1.sql`)

#### Enhanced Tables:
- **`crews`** - Enhanced with `leader_phone`, `skills[]`, `max_jobs_per_day`, `typical_install_speed`, `is_active`

#### New Tables Created:
1. **`job_crews`** - Links jobs to assigned crews (many-to-many with primary crew flag)
2. **`crew_checkins`** - Tracks crew check-ins throughout install day (on_the_way, arrived, in_progress, lunch, completed)
3. **`job_progress_photos`** - Progress photos uploaded by crews (before, during, after, issue, material, access)
4. **`install_day_timeline`** - Tracks install day milestones and progress stages
5. **`material_verification`** - Tracks material delivery verification and access issues
6. **`homeowner_updates`** - Tracks automated homeowner update messages sent during install day

#### Helper Functions:
- `get_available_crews()` - Returns available crews based on skills and availability
- `get_install_day_status()` - Returns comprehensive install day status for a job

#### Triggers:
- Auto-creates timeline entry when crew checks in as "arrived"
- Auto-updates job progress when timeline milestones are reached

### 2. Edge Function (`supabase/functions/install-day-messages/index.ts`)

Sends morning messages at 7 AM on install day:
- **To Crew Leader**: Job address, homeowner name, ETA window, notes
- **To Homeowner**: Arrival window, promise of updates throughout the day

### 3. API Routes

#### Crew Management:
- `GET /api/crews` - List all crews for workspace
- `POST /api/crews` - Create new crew
- `GET /api/crews/[id]` - Get crew details
- `PUT /api/crews/[id]` - Update crew
- `DELETE /api/crews/[id]` - Deactivate crew

#### Job Crew Assignment:
- `POST /api/jobs/[id]/assign-crew` - Assign crew to job
- `GET /api/jobs/[id]/recommend-crew` - Get recommended crews based on skills and availability

#### Install Day Operations:
- `POST /api/jobs/[id]/checkin` - Record crew check-in
- `GET /api/jobs/[id]/checkin` - Get check-in history
- `GET /api/jobs/[id]/install-day-status` - Get comprehensive install day status
- `GET /api/jobs/[id]/timeline` - Get timeline milestones
- `POST /api/jobs/[id]/timeline` - Add timeline milestone
- `GET /api/jobs/[id]/photos` - List progress photos
- `POST /api/jobs/[id]/photos` - Upload photo metadata
- `GET /api/jobs/[id]/material-verification` - Get material verification status
- `POST /api/jobs/[id]/material-verification` - Update material verification

#### Cron Jobs:
- `GET /api/cron/install-day-messages` - Sends morning messages (runs at 7 AM)
- `GET /api/cron/install-day-delay-detection` - Detects delays and sends notifications (runs at 10 AM)

### 4. UI Components

#### `CrewAssignmentPanel` (`src/components/crew/CrewAssignmentPanel.tsx`)
- Displays recommended crews based on skills and availability
- Shows skill match scores and current job load
- Allows one-click crew assignment
- Highlights recommended crew

#### `InstallDayLiveView` (`src/components/crew/InstallDayLiveView.tsx`)
- Real-time install day status dashboard
- Shows crew info, current status, progress percentage
- Displays timeline milestones
- Shows material verification status
- Photo count and homeowner updates sent
- Auto-refreshes every 30 seconds

#### `CrewCheckInMobile` (`src/components/crew/CrewCheckInMobile.tsx`)
- Mobile-friendly check-in interface
- 5 status buttons: On the Way, Arrived, In Progress, Lunch Break, Complete
- Optional notes field
- Quick actions for photo upload and material verification
- Visual feedback for last submitted status

### 5. Helper Functions (`src/lib/install-day-coordination.ts`)

- `sendHomeownerUpdate()` - Sends SMS updates to homeowners
- `getInstallDayStatus()` - Gets comprehensive install day status
- `getAvailableCrews()` - Gets available crews for assignment

### 6. Cron Configuration (`vercel.json`)

Added two cron jobs:
- **7 AM Daily**: Install day morning messages
- **10 AM Daily**: Delay detection and notifications

## 🚀 How It Works

### Crew Assignment Flow

1. **Job enters "scheduled" stage** → System suggests available crews
2. **Contractor reviews recommendations** → Sees skill match scores and availability
3. **Contractor assigns crew** → One-click assignment via UI
4. **System logs assignment** → Creates `job_crews` record

### Install Day Flow

1. **7:00 AM** → Cron job sends morning messages:
   - Crew leader gets job details and address
   - Homeowner gets arrival window notification

2. **Crew checks in** → Crew leader uses mobile UI to check in:
   - "On the Way" → Crew is en route
   - "Arrived" → Auto-creates timeline entry, sends homeowner update
   - "In Progress" → Work has begun
   - "Lunch" → Crew on break
   - "Complete" → Job finished for the day

3. **Timeline milestones** → Contractor or crew can log:
   - Crew arrival
   - Tear-off start/complete
   - Underlayment start/complete
   - Shingling start/complete
   - Cleanup start/complete
   - Job complete

4. **Progress photos** → Crew uploads photos:
   - Before, during, after
   - Issues, materials, access problems

5. **Material verification** → Crew confirms:
   - Materials arrived
   - Bundle count
   - Access issues (driveway too narrow, dog loose, etc.)

6. **Homeowner updates** → System automatically sends:
   - "Crew has arrived"
   - "Tear-off has begun"
   - "Installing underlayment"
   - "Shingling now underway"
   - "Cleanup in progress"
   - "Installation complete!"

7. **10:00 AM** → Delay detection:
   - If crew hasn't checked in as "arrived" by 10 AM
   - System messages crew leader
   - System messages contractor
   - System sends polite delay notification to homeowner

## 📱 Usage Examples

### Assigning a Crew

```tsx
import { CrewAssignmentPanel } from "@/components/crew/CrewAssignmentPanel";

<CrewAssignmentPanel 
  jobId={job.id}
  onCrewAssigned={(crewId) => {
    console.log("Crew assigned:", crewId);
  }}
/>
```

### Viewing Install Day Status

```tsx
import { InstallDayLiveView } from "@/components/crew/InstallDayLiveView";

<InstallDayLiveView 
  jobId={job.id}
  refreshInterval={30000} // Refresh every 30 seconds
/>
```

### Crew Check-In (Mobile)

```tsx
import { CrewCheckInMobile } from "@/components/crew/CrewCheckInMobile";

<CrewCheckInMobile 
  jobId={job.id}
  crewId={crew.id}
  onCheckIn={() => {
    // Refresh status
  }}
/>
```

## 🔧 Configuration

### SMS Provider Setup

The system supports both Twilio and Vonage/Nexmo. Configure via environment variables:

```env
# Twilio
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Vonage/Nexmo
VONAGE_SMS_URL=https://your-vonage-endpoint.com/sms
```

Or configure per-workspace via `workspace_settings.settings.sms`.

### Cron Jobs

Cron jobs are configured in `vercel.json`:
- Install day messages: `0 7 * * *` (7 AM daily)
- Delay detection: `0 10 * * *` (10 AM daily)

## 🎯 Key Features

1. **Smart Crew Assignment** - Recommends crews based on skills and availability
2. **Automated Morning Messages** - Sends instructions at 7 AM without contractor intervention
3. **Real-Time Check-Ins** - Crew can check in via mobile interface
4. **Progress Tracking** - Timeline milestones track job progress
5. **Photo Documentation** - Crew uploads progress photos automatically
6. **Material Verification** - Tracks material delivery and access issues
7. **Homeowner Updates** - Automated SMS updates throughout install day
8. **Delay Detection** - Automatically detects and handles delays

## 📊 Database Schema Summary

- **6 new tables** for install day coordination
- **2 helper functions** for crew recommendations and status
- **2 triggers** for automatic timeline creation
- **Full RLS policies** for team-based access control

## 🚦 Next Steps

1. **Run Migration**: Apply `20250131000000_block34044_crew_dispatch_install_day_coordination_v1.sql`
2. **Configure SMS**: Set up Twilio or Vonage credentials
3. **Create Crews**: Use `/api/crews` to create crew profiles
4. **Assign Crews**: Use `CrewAssignmentPanel` component in job pages
5. **Monitor Install Days**: Use `InstallDayLiveView` for real-time tracking
6. **Crew Check-Ins**: Provide mobile interface using `CrewCheckInMobile`

## 💡 Impact

This feature transforms SmartSend from a CRM into a **full roofing operations system**:

- ✅ Eliminates production chaos
- ✅ Stops homeowners from calling all day
- ✅ Reduces delays through accountability
- ✅ Increases homeowner satisfaction
- ✅ Gives contractor visibility without driving to every site
- ✅ Makes SmartSend the daily operating system for roofers

---

**Implementation Date**: January 2025  
**Block**: 34044  
**Status**: ✅ Complete

































