# Block 15900 — SmartSend Local Weather Engine v1

## Implementation Summary

Real-Time Roof-Relevant Weather Alerts, Storm Mapping, ZIP-Level Risk Detection & Campaign Triggers

## Overview

The Local Weather Engine v1 gives SmartSend the power to track weather and storms automatically at the ZIP and neighborhood level, then use that data to:
- Personalize outreach
- Tag homeowners
- Trigger campaigns
- Boost urgency
- Increase booked inspections
- Surface high-value insurance jobs

## Features Implemented

### 1. Real-Time ZIP-Level Weather Monitoring
- **Cron Job**: `/api/cron/weather-monitor` runs every 2 hours
- Monitors all ZIPs in each roofer's service area
- Tracks: hail, wind bursts, heavy rain, snow load, freeze/thaw cycles, severe weather alerts, NWS advisories/warnings
- Stores storm intensity scores (0-100)

### 2. Storm → Homeowner Impact Detection
- Automatically scans all contacts and marks storm-affected homeowners
- Based on ZIP match, neighborhood match, time of storm, and storm intensity thresholds
- Automatic tags: `recent_storm`, `hail_event`, `wind_event`, `heavy_rain`
- Storm risk score (0-100) assigned to each homeowner

### 3. Storm Risk Score System
- **High (70-100)**: Confirmed hail or wind damage
- **Medium (40-69)**: Nearby storm or heavy rain
- **Low (0-39)**: Not in path or minimal impact
- Used for personalization, urgency, campaign recommendations, and follow-up speed

### 4. Personalized Storm Inserts in Emails
- Helper functions in `lib/weather/personalization.ts`
- Supports placeholders: `{{recent_storm_date}}`, `{{storm_type}}`, `{{hail_date}}`, `{{wind_speed}}`, `{{neighborhood}}`, `{{zip}}`, `{{storm_context}}`
- Examples:
  - "Last week's hail in {{neighborhood}} can loosen shingles."
  - "People in {{zip}} saw 55mph winds — want me to check the roof?"

### 5. Automatic Storm Campaign Trigger
- When a storm hits a ZIP with intensity score ≥ 40, suggests a campaign
- Pre-loaded with correct template, personalization, and storm-based urgency
- List filtered by impacted homeowners
- Roofer can review → press "Start"

### 6. Weather Dashboard
- **Path**: `/insights/weather`
- Shows:
  - Map of service area (conceptual)
  - Storm markers
  - Alerts
  - Affected ZIPs
  - Impacted homeowners
  - Risk levels
  - Suggested actions
- Simple, rugged, contractor-friendly interface

### 7. Storm Timeline
- Each storm event is logged with:
  - Timestamp
  - Severity
  - Impacted ZIPs
  - Number of affected contacts
  - Recommended campaign
  - "Send Now" button

## Database Schema

### Tables Created

1. **weather_events**
   - Stores storm events detected at ZIP code level
   - Fields: storm_type, zip, severity, storm_started_at, storm_ended_at, hail_size, wind_speed, rain_inches, storm_intensity_score, nws_alert_id, etc.

2. **contact_storm_impacts**
   - Links contacts to storm events (many-to-many)
   - Fields: contact_id, weather_event_id, storm_risk_score, storm_risk_level, impact_type, zip_match, neighborhood_match

3. **storm_campaign_triggers**
   - Tracks suggested campaigns based on storm events
   - Fields: workspace_id, weather_event_id, campaign_id, status, affected_contacts_count, affected_zips, storm_summary

4. **workspace_service_zips**
   - Tracks which ZIP codes each workspace monitors
   - Fields: workspace_id, zip, city, state, source

### Functions Created

1. **calculate_storm_risk_score()** - Calculates storm risk score (0-100) based on storm measurements
2. **get_storm_risk_level()** - Determines storm risk level (low/medium/high) from score
3. **detect_storm_affected_contacts()** - Detects and tags contacts affected by a storm event

## API Endpoints

### Weather Monitoring
- `POST /api/cron/weather-monitor` - Cron job that runs every 2 hours

### Weather Data
- `GET /api/weather/events` - Get weather events for a workspace
- `GET /api/weather/impacts` - Get storm impacts for contacts
- `GET /api/weather/stats` - Get weather statistics for dashboard
- `GET /api/weather/triggers` - Get storm campaign triggers
- `POST /api/weather/triggers` - Update storm campaign trigger status
- `POST /api/weather/sync-service-zips` - Sync workspace service ZIPs from contacts

## Files Created

### Database
- `supabase/migrations/20250130000001_block15900_local_weather_engine_v1.sql`

### API Routes
- `app/api/cron/weather-monitor/route.ts`
- `app/api/weather/events/route.ts`
- `app/api/weather/impacts/route.ts`
- `app/api/weather/stats/route.ts`
- `app/api/weather/triggers/route.ts`
- `app/api/weather/sync-service-zips/route.ts`

### Frontend
- `app/insights/weather/page.tsx` - Weather dashboard page

### Libraries
- `lib/weather/personalization.ts` - Storm personalization helpers

### Configuration
- Updated `vercel.json` with weather monitoring cron schedule

## Setup Instructions

### 1. Run Database Migration
```sql
-- Run the migration file in Supabase SQL Editor
-- supabase/migrations/20250130000001_block15900_local_weather_engine_v1.sql
```

### 2. Sync Service ZIPs
After importing contacts, call:
```bash
POST /api/weather/sync-service-zips
```
This populates `workspace_service_zips` from existing contacts.

### 3. Configure Cron Job
The cron job is already configured in `vercel.json`:
```json
{
  "path": "/api/cron/weather-monitor",
  "schedule": "0 */2 * * *"
}
```

### 4. Access Weather Dashboard
Navigate to `/insights/weather` in the app.

## Usage Examples

### Using Storm Personalization in Email Templates

```typescript
import { getStormPersonalizationData, replaceStormPlaceholders } from "@/lib/weather/personalization";

// Get storm data for a contact
const stormData = await getStormPersonalizationData(contactId, workspaceId);

// Replace placeholders in template
const personalizedTemplate = replaceStormPlaceholders(template, stormData);
```

### Template Placeholders Available

- `{{recent_storm_date}}` - Date of recent storm (e.g., "January 15, 2025")
- `{{storm_type}}` - Type of storm (e.g., "hail", "wind")
- `{{storm_severity}}` - Severity level (e.g., "high", "medium")
- `{{hail_date}}` - Date of hail event
- `{{hail_size}}` - Hail size in inches
- `{{wind_speed}}` - Wind speed in mph
- `{{rain_inches}}` - Rainfall in inches
- `{{neighborhood}}` - Neighborhood/city name
- `{{zip}}` - ZIP code
- `{{storm_context}}` - Smart contextual message based on storm type

## Storm Detection Thresholds

- **Hail**: ≥ 0.75 inches triggers high risk
- **Wind**: ≥ 50 mph triggers high risk
- **Rain**: ≥ 2.0 inches triggers high risk
- **Campaign Trigger**: Storm intensity score ≥ 40 suggests campaign

## Why Roofers Will Love This

1. **Storm = roofing money** - SmartSend turns storms into booked estimates automatically
2. **ZERO effort** - Roofers don't manually track storms — SmartSend does it
3. **Local personalization REVOLUTIONIZES reply rates** - Homeowners feel you KNOW their exact situation
4. **Insurance claims flow naturally** - Storm → claim → job
5. **They see SmartSend as a true "AI for roofers" system** - This is a killer feature that sets you apart FOREVER

## Next Steps (Future Enhancements)

1. Integrate with HailTrace API for more accurate hail data
2. Add map visualization with storm markers
3. Add email notifications for high-severity storms
4. Add storm history and trends analysis
5. Add integration with insurance claim databases
6. Add neighborhood-level storm tracking (beyond ZIP)
7. Add predictive storm alerts (forecast-based)

## Notes

- The weather monitoring cron job uses NOAA/NWS APIs
- In production, you may want to integrate with additional weather data providers (HailTrace, WeatherFlow, etc.)
- The geocoding for ZIP coordinates is simplified - consider using a proper geocoding service in production
- Storm detection is currently based on NWS alerts - can be enhanced with additional data sources





















































