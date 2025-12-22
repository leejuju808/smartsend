# Block 78000 — Campaign Scheduler + Smart Send Times Engine v1

## ✅ Implementation Complete

This block implements a complete campaign scheduling system with AI-powered smart send times that learns from homeowner behavior to maximize email engagement.

## 🎯 What This Solves

**Problem:** Roofers send emails at the wrong times, leading to:
- Low open rates
- Low conversions
- Wasted campaigns
- Burnt domains

**Solution:** SmartSend now automatically:
- Tracks homeowner behavior by ZIP code, day, and hour
- Learns optimal send times
- Schedules emails in smart waves
- Protects domain reputation
- Maximizes engagement

## 📦 Components Implemented

### 1. Database Schema (`supabase/migrations/20250130000001_block78000_campaign_scheduler_smart_send_v1.sql`)

**Tables Created:**
- `campaign_schedules` - Stores scheduling configuration
- `open_behavior` - Tracks opens/replies by ZIP, day, hour (AI training data)
- `send_waves` - Manages smart batching of emails
- `wave_recipients` - Links recipients to waves

**Key Features:**
- Three schedule modes: `specific_time`, `smart_send`, `interval`
- Behavior tracking with calculated open/reply rates
- Wave-based sending for deliverability protection
- Multi-domain staggering support
- Weather-based scheduling hooks

### 2. Smart Send Algorithm (`src/lib/smart-send/algorithm.ts`)

**Functions:**
- `getBestSendTimes()` - Analyzes behavior to recommend optimal send times
- `selectOptimalSendTime()` - Selects best time for a specific ZIP code
- `recordEngagement()` - Records opens/replies/sends for learning
- `getZipcodeHotspots()` - Identifies top-performing ZIP codes
- `getRecommendedSendRate()` - Calculates safe send rates

**Algorithm Logic:**
- Scores times based on 60% open rate + 40% reply rate
- Requires minimum 10 data points for recommendations
- Falls back to industry best practices when no data available
- Confidence levels: high (50+ data points), medium (20+), low (<20)

### 3. Wave Generator (`src/lib/smart-send/wave-generator.ts`)

**Functions:**
- `generateSendWaves()` - Creates smart batches of emails
- `createWavesInDatabase()` - Persists waves to database

**Wave Logic:**
- Groups recipients by ZIP code
- Selects optimal send time for each wave
- Distributes emails across time windows
- Protects deliverability with controlled sending

### 4. Behavior Tracker (`src/lib/smart-send/behavior-tracker.ts`)

**Functions:**
- `trackEmailOpen()` - Records email opens
- `trackEmailReply()` - Records email replies
- `trackEmailSend()` - Records email sends
- `syncBehaviorFromEmailLogs()` - Batch sync from existing email logs

**Integration Points:**
- Hooks into email tracking system
- Extracts ZIP codes from lead locations
- Updates behavior data in real-time

### 5. Wave Executor (`src/lib/smart-send/wave-executor.ts`)

**Functions:**
- `executeWave()` - Executes a send wave
- `processDueWaves()` - Processes all due waves (cron job)

**Features:**
- Multi-domain staggering
- Error handling and retries
- Status tracking
- Integration with email sending system

### 6. API Endpoints

**`/api/campaigns/[id]/schedule-smart`** (POST)
- Creates campaign schedule
- Generates send waves
- Supports all three schedule modes

**`/api/smart-send/recommendations`** (GET)
- Returns best send times
- Shows ZIP code hotspots
- Provides recommended send rates

**`/api/smart-send/track`** (POST)
- Tracks email engagement events
- Updates behavior data

**`/api/cron/process-waves`** (POST)
- Cron job to process due waves
- Should be called every minute

### 7. UI Components

**`SmartScheduleSettings.tsx`**
- Three-tab interface for schedule modes
- Smart Send configuration panel
- Shows best time windows
- ZIP code hotspots display
- Wave settings configuration

**`SendWavesView.tsx`**
- Displays all waves for a campaign
- Shows wave status and metrics
- ZIP code distribution
- Send/failed counts

**`BehaviorGraphs.tsx`**
- Opens by hour/day charts
- Replies by hour/day charts
- ZIP code performance table
- Visual bar charts for engagement

## 🚀 Usage

### Creating a Smart Send Schedule

```typescript
// In your campaign page
import { SmartScheduleSettings } from '@/components/campaigns/SmartScheduleSettings';

<SmartScheduleSettings
  campaignId={campaignId}
  workspaceId={workspaceId}
  onScheduleCreated={() => {
    // Refresh campaign data
  }}
/>
```

### Tracking Email Engagement

```typescript
// When email is opened
await fetch('/api/smart-send/track', {
  method: 'POST',
  body: JSON.stringify({
    eventType: 'open',
    workspaceId,
    emailLogId,
    leadId,
  }),
});

// When email is replied to
await fetch('/api/smart-send/track', {
  method: 'POST',
  body: JSON.stringify({
    eventType: 'reply',
    workspaceId,
    emailLogId,
    leadId,
  }),
});
```

### Viewing Behavior Analytics

```typescript
import { BehaviorGraphs } from '@/components/campaigns/BehaviorGraphs';

<BehaviorGraphs workspaceId={workspaceId} zipcode={optionalZipcode} />
```

## 🔧 Setup

### 1. Run Migration

```sql
-- Run the migration file
\i supabase/migrations/20250130000001_block78000_campaign_scheduler_smart_send_v1.sql
```

### 2. Set Up Cron Job

Add to your cron scheduler (e.g., Vercel Cron, Supabase Edge Function):

```
*/1 * * * * POST /api/cron/process-waves
```

### 3. Integrate Email Tracking

Add tracking calls to your email sending system:

```typescript
// After sending email
await trackEmailSend(workspaceId, leadId, email);

// When email is opened (via tracking pixel)
await trackEmailOpen(workspaceId, emailLogId, leadId);

// When email is replied to
await trackEmailReply(workspaceId, emailLogId, leadId);
```

## 📊 How It Works

1. **Learning Phase:**
   - System tracks every email send, open, and reply
   - Data stored by ZIP code, day of week, and hour
   - Calculates open rates and reply rates

2. **Recommendation Phase:**
   - Algorithm analyzes behavior data
   - Scores each time slot (60% open rate + 40% reply rate)
   - Returns top recommendations with confidence levels

3. **Scheduling Phase:**
   - User selects Smart Send mode
   - System generates waves based on optimal times
   - Waves distributed across time windows

4. **Execution Phase:**
   - Cron job processes due waves
   - Emails sent at optimal times
   - Multi-domain staggering protects deliverability

5. **Feedback Loop:**
   - Engagement tracked in real-time
   - Behavior data updated
   - Recommendations improve over time

## 🎨 UI Features

### Schedule Settings Page
- **Smart Send Tab:** AI-powered timing with recommendations
- **Specific Time Tab:** Manual date/time selection
- **Interval Tab:** Regular interval sending

### Send Waves View
- Wave status badges (pending, sending, sent, failed)
- Recipient counts
- ZIP code distribution
- Send/failed metrics

### Behavior Graphs
- Opens by hour (bar chart)
- Replies by hour (bar chart)
- Opens by day of week
- Replies by day of week
- Top ZIP codes performance table

## 🔐 Security

- All tables have RLS enabled
- Workspace-based access control
- Service role for cron jobs
- User authentication required for API endpoints

## 📈 Performance

- Indexed queries for fast lookups
- Minimum data thresholds prevent noise
- Batch processing for waves
- Efficient upsert operations

## 🚧 Future Enhancements

1. **Weather API Integration** (Block 8)
   - Prioritize ZIP codes during weather events
   - Auto-adjust timing for storm-related campaigns

2. **Device Type Tracking**
   - Mobile vs desktop engagement patterns
   - Time adjustments based on device

3. **A/B Testing**
   - Test different send times
   - Learn which times work best per campaign type

4. **Predictive Modeling**
   - Machine learning for time predictions
   - Seasonal adjustments
   - Industry-specific patterns

## 🎯 Why This Makes Roofers Feel Stupid for Not Using It

**Before SmartSend:**
- ❌ Send at 9 AM (predictable → spam)
- ❌ Blast all emails at once
- ❌ No learning from behavior
- ❌ Manual scheduling
- ❌ Burnt domains

**With SmartSend:**
- ✅ Sends at optimal times (learned from data)
- ✅ Smart waves protect deliverability
- ✅ Learns and improves continuously
- ✅ Automatic scheduling
- ✅ Protected domain reputation
- ✅ Higher open rates
- ✅ Higher reply rates
- ✅ More booked estimates

This is the unlock that turns campaigns into booked estimates. 🚀



























