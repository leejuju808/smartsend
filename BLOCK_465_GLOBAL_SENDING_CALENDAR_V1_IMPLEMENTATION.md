# Block 465 — Global Sending Calendar v1 Implementation

## ✅ Implementation Complete

This block creates the GLOBAL brain for WHEN SmartSend sends, controlling time at the entire workspace level. This is the same layer that exists in Outreach, Salesloft, Apollo, Instantly, and Smartlead, but enhanced with integrations to Predictions, Fleet Manager, Inbox Inspector, AI Advisor, and more.

## 📦 What Was Implemented

### 1. Database Schema (`supabase/migrations/20250130000001_block_465_global_sending_calendar_v1.sql`)

#### Core Tables:

- **`global_sending_rules`** - Workspace-level throttle rules
  - Max sends per minute/hour
  - Max sends per inbox per hour
  - Auto-pause triggers (bounce threshold, spam threshold)
  - Midnight safety reset configuration

- **`workspace_sending_calendar`** - Workspace-level sending calendar
  - Allowed sending days (1=Monday, 7=Sunday)
  - Allowed time windows (multiple windows per day supported)
  - Timezone configuration
  - Smart pacing settings (even, front_loaded, back_loaded, prediction_based)
  - Region-based timing toggle

- **`inbox_sending_calendar`** - Inbox-level overrides
  - Can override workspace settings per inbox
  - Optional allowed days, time windows, timezone

- **`sending_calendar_holidays`** - Holiday blocking
  - US federal holidays (default)
  - Custom workspace holidays
  - Regional holidays
  - Auto-block enabled flag

- **`sending_calendar_activity_log`** - Activity tracking
  - Logs all calendar events (holiday blocks, window conflicts, throttles, etc.)

#### Helper Functions:

- `is_within_global_sending_window()` - Check if time is within allowed window
- `get_next_valid_send_time_global()` - Get next valid send time respecting calendar
- `calculate_smart_pacing()` - Calculate pacing plan for inbox
- `check_global_throttle_rules()` - Check throttle limits
- `log_sending_calendar_activity()` - Log calendar events
- `check_inbox_inspector_pause()` - Check for DNS issues from Inbox Inspector

### 2. Integration Functions (`supabase/migrations/20250130000002_block_465_integrations.sql`)

#### Fleet Manager Integration:

- `get_fleet_inbox_capacity_with_calendar()` - Get inbox capacity with calendar constraints
- Applies calendar rules to Fleet Manager capacity calculations

#### Smart Resend Engine Integration:

- `schedule_retry_with_calendar()` - Enhanced retry scheduling that respects calendar
- Reschedules retries according to next valid send time
- Logs calendar adjustments

#### Predictions v1 Integration:

- `optimize_send_time_with_predictions()` - Optimize send timing based on predictions
- Uses prediction-based pacing strategy
- Finds optimal hours within allowed windows

#### Inbox Inspector Integration:

- `apply_inbox_inspector_pause()` - Auto-pause inboxes with DNS issues
- Checks for SPF/DKIM/DMARC errors
- Auto-pauses for 12 hours when issues detected

#### AI Advisor Integration:

- `generate_calendar_advisor_alerts()` - Generate alerts for calendar conflicts
- Detects inboxes with no allowed window today
- Suggests predicted high-open windows

#### Comprehensive Check Function:

- `can_send_now_global()` - Main function combining all checks
  - Checks sending window
  - Checks throttle rules
  - Checks inbox inspector pause
  - Returns next valid time if blocked

### 3. Send Dispatcher Integration (`supabase/functions/send-dispatcher/index.ts`)

Updated send-dispatcher to use `can_send_now_global()` instead of old Block 427 functions:
- Checks calendar before sending
- Reschedules jobs outside windows
- Respects throttle rules
- Applies region-based timing

### 4. API Endpoints (`app/api/v1/sending-calendar/`)

- **GET/POST `/api/v1/sending-calendar`** - Get/update workspace calendar settings
- **GET/POST `/api/v1/sending-calendar/inboxes/[inboxId]`** - Get/update inbox calendar overrides
- **GET `/api/v1/sending-calendar/activity`** - Get activity log
- **GET `/api/v1/sending-calendar/advisor-alerts`** - Get AI Advisor alerts

### 5. UI Components (`app/(dashboard)/deliverability/sending-calendar/page.tsx`)

Sending Calendar page with:
- **Daily/Weekly/Inbox/Global views** (view selector implemented)
- **Allowed Days** - Visual day selector (Mon-Sun)
- **Time Windows** - Multiple time windows per day
- **Timezone Configuration** - Dropdown for timezone selection
- **Global Throttle Rules** - Max sends per minute/hour/inbox
- **Holiday Blocking** - Display of blocked holidays
- **Recent Activity** - Activity log sidebar
- **AI Advisor Alerts** - Alert banner for conflicts and optimizations

## 🎯 Key Features

### ✅ Workspace-Level Sending Windows
- Configure allowed days (Mon-Fri default)
- Multiple time windows per day (e.g., 9 AM-12 PM, 1 PM-5 PM)
- Applies to sequences, manual broadcasts, fleet distribution, failovers, retries

### ✅ Inbox-Level Overrides
- Each inbox can override workspace settings
- Fine-grained control for deliverability protection

### ✅ Global Throttle Rules
- Max sends per minute (workspace-wide)
- Max sends per hour
- Max sends per inbox per hour
- Auto-slowdown on bounce threshold
- Auto-pause on spam complaints

### ✅ Holiday Blocking
- US federal holidays (default)
- Custom workspace holidays
- Multi-day holiday support
- Auto-block enabled/disabled per holiday

### ✅ Region-Based Timing
- Converts sending windows to lead's timezone
- Falls back to domain timezone or default US time
- Respects lead country for regional holidays

### ✅ Smart Pacing Algorithm
- Even distribution across windows
- Front-loaded or back-loaded strategies
- Prediction-based optimization (uses Predictions v1)
- Spreads sends evenly over permitted window

### ✅ Integration with Fleet Manager
- Calendar applies to capacity calculations
- Fleet Manager → capacity, Sending Calendar → timing

### ✅ Integration with Smart Resend Engine
- Retries rescheduled according to calendar
- Respects region timing and inbox availability

### ✅ Integration with Predictions v1
- Avoids predicted high-risk hours
- Boosts sends during predicted high-open windows
- Prediction-based pacing strategy

### ✅ Integration with Inbox Inspector
- Auto-pauses inboxes with DNS issues (SPF/DKIM/DMARC errors)
- 12-hour pause duration
- Moves sends to alternate healthy inbox

### ✅ AI Advisor Alerts
- Window conflict warnings
- Predicted high-open window suggestions
- Optimization recommendations

### ✅ Activity Log
- Tracks all calendar events
- Holiday blocks, window conflicts, throttles, pacing adjustments

## 🚀 Usage

### Access the Sending Calendar

Navigate to: **Sidebar → Deliverability → Sending Calendar**

### Configure Workspace Calendar

1. Select allowed days (Mon-Fri default)
2. Add time windows (e.g., 9 AM-12 PM, 1 PM-5 PM)
3. Set timezone
4. Enable smart pacing
5. Configure throttle rules

### Configure Inbox Overrides

1. Go to inbox settings
2. Enable override
3. Set custom days/windows/timezone

### Add Custom Holidays

1. Go to Sending Calendar page
2. Add custom holiday with date range
3. Enable auto-block

## 📊 Impact

This block immediately boosts:
- ✅ **Deliverability** - Avoids bad hours and holidays
- ✅ **Reply Rates** - Timed to human behavior
- ✅ **Safety** - Auto-pause on issues
- ✅ **Stability** - Consistent pacing, no bursts

## 🔗 Integration Points

- **Fleet Manager** - Capacity calculations respect calendar
- **Smart Resend Engine** - Retries rescheduled per calendar
- **Predictions v1** - Optimizes timing based on predictions
- **Inbox Inspector** - Auto-pauses on DNS issues
- **AI Advisor** - Generates calendar alerts
- **Router v2** - Routing respects calendar constraints

## 🎉 Block 465 Complete

Block 465 — Global Sending Calendar v1 shipped. This is one of the most important blocks for reliability and scale, enabling enterprise-grade sending behavior that separates SmartSend from "cheap cold email tools."



