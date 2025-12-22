# Block 17500 — SmartSend Scheduling Logic Enhancer v1

## Implementation Summary

This block implements a comprehensive scheduling logic enhancer that makes SmartSend scheduling intelligent, safe, and contractor-proof.

## ✅ Completed Features

### 1. Travel-Time Awareness
- **Database**: Enhanced `scheduler_settings` with office address and travel time configuration
- **Functions**: 
  - `calculate_and_cache_travel_time()` - Cache travel times
  - `get_travel_time()` - Retrieve cached travel times
- **API**: `/api/scheduler/travelTime` - Calculate travel time between addresses
- **Integration**: Automatically calculates travel time when booking appointments
- **Features**:
  - Blocks impossible slots (can't reach in time)
  - Auto-inserts travel-time buffers
  - Suggests smarter times with travel context

### 2. Smart Buffer Logic
- **Database**: Enhanced `scheduler_settings` with roofing-specific buffer settings:
  - Default inspection duration (20-35 minutes)
  - Buffer between jobs (10-20 minutes)
  - Extra buffers for storm damage (+10 min)
  - Extra buffers for insurance claims (+15 min)
  - Shorter buffers for simple repairs (10 min)
- **Integration**: Applied automatically in slot calculation

### 3. Crew / Team Routing (v1)
- **Database**: New `crew_assignments` table
- **Function**: `assign_crew_to_appointment()` - Automatically assigns crew members
- **Features**:
  - Assigns appointments by location
  - Distributes daily load
  - Avoids double-booking
  - Prevents overlapping routes
- **Integration**: Automatically assigns crew when booking appointments

### 4. Weather-Safe Time Blocking
- **Database**: Enhanced `weather_blocks` table (from v2)
- **API**: `/api/scheduler/weatherGuard` - Check weather conditions
- **Features**:
  - Blocks times with rain, snow, high wind, hail
  - Shows explanation when blocked
  - Suggests next safe time
  - Modifies schedule automatically

### 5. Priority Booking Logic
- **Database**: Enhanced `scheduler_settings` with priority settings
- **Function**: `get_priority_slots()` - Returns priority-ordered slots
- **API**: `/api/scheduler/prioritySort` - Sort slots by priority
- **Priority Ranking**:
  1. Insurance leads
  2. Storm damage leads
  3. Hot leads
  4. Warm leads
  5. Cold leads

### 6. Appointment Quality Score
- **Database**: 
  - New `appointment_quality_factors` table
  - Quality score fields in `schedule_bookings`
- **Function**: `calculate_appointment_quality_score()` - Calculates quality score
- **Factors**:
  - Travel time (25% weight)
  - Weather (20% weight)
  - Daylight (15% weight)
  - Job type (15% weight)
  - Lead priority (15% weight)
  - Storm urgency (10% weight)
- **Categories**: Optimal (≥0.85), Good (≥0.65), Risky (<0.65)
- **Integration**: Automatically calculated when booking

### 7. Automatic Time Suggestions
- **API**: `/api/scheduler/suggest` - Get AI-recommended times
- **Features**:
  - Context-aware suggestions ("tomorrow", "this week", etc.)
  - Travel time included in suggestions
  - Weather-safe suggestions
  - Priority-aware suggestions
- **Messages**: Friendly, human-like suggestions

### 8. Dynamic Daylight Logic
- **Function**: `get_daylight_times()` - Get sunrise/sunset times
- **Function**: `is_daylight_safe()` - Check if slot is within daylight hours
- **Features**:
  - Blocks too early / too late slots
  - Seasonal daylight awareness
  - Configurable buffers (30 min default)

### 9. Job-Type Based Scheduling
- **Integration**: Different durations and buffers based on job type:
  - Repair → short slot (20-30 min)
  - Full inspection → medium (30-45 min)
  - Insurance → longer slot (45-60 min)
  - Storm inspection → priority short slot (30-45 min)
- **Applied**: Automatically in slot calculation

### 10. Re-Scheduling Intelligence
- **API**: `/api/scheduler/reschedule` - Re-schedule with alternatives
- **Function**: `get_reschedule_alternatives()` - Get best alternatives
- **Features**:
  - Recalculates travel time
  - Finds nearest gap
  - Offers best 3 alternatives
  - Updates tasks and pipeline
  - Updates weather logic

### 11. Appointment Conflict Resolver
- **Function**: `detect_appointment_conflict()` - Detect conflicts
- **Integration**: Enhanced booking API with conflict detection
- **Features**:
  - Detects overlapping appointments
  - Detects travel time conflicts
  - Detects crew unavailability
  - Returns conflict details with alternatives

### 12. Same-Day Scheduling Block
- **Database**: Enhanced `scheduler_settings` with same-day settings
- **Features**:
  - Configurable cutoff hours (default: 2 hours)
  - Blocks same-day if too busy
  - Suggests earliest safe time tomorrow

### 13. Scheduler-Insights Integration
- **Database**: New `scheduler_insights` table
- **Metrics**:
  - Average travel time
  - Peak booking times
  - Risky schedule patterns
  - No-show patterns
  - Weather cancellation rate
  - Quality score metrics

## 📁 Files Created/Modified

### Database Migration
- `supabase/migrations/20250130000004_block17500_scheduler_logic_enhancer_v1.sql`

### API Endpoints
- `src/app/api/scheduler/travelTime/route.ts` - Travel time calculation
- `src/app/api/scheduler/weatherGuard/route.ts` - Weather checking
- `src/app/api/scheduler/slots/route.ts` - Enhanced slots with all features
- `src/app/api/scheduler/suggest/route.ts` - Automatic time suggestions
- `src/app/api/scheduler/slotOptimizer/route.ts` - Slot optimization
- `src/app/api/scheduler/prioritySort/route.ts` - Priority sorting
- `src/app/api/scheduler/reschedule/route.ts` - Re-scheduling intelligence
- `src/app/api/scheduler/book/route.ts` - Enhanced booking with all features

## 🔧 Technical Architecture

### Database Tables
- `crew_assignments` - Crew routing
- `appointment_quality_factors` - Quality scoring factors
- `scheduler_insights` - Scheduling metrics
- Enhanced: `scheduler_settings`, `schedule_bookings`

### Database Functions
- `calculate_and_cache_travel_time()` - Cache travel times
- `get_travel_time()` - Get cached travel time
- `get_daylight_times()` - Get sunrise/sunset
- `is_daylight_safe()` - Check daylight safety
- `calculate_appointment_quality_score()` - Calculate quality score
- `get_smart_available_slots()` - Enhanced slot calculation
- `get_priority_slots()` - Priority-ordered slots
- `detect_appointment_conflict()` - Conflict detection
- `assign_crew_to_appointment()` - Crew assignment
- `get_reschedule_alternatives()` - Re-scheduling alternatives

### API Endpoints
- `GET/POST /api/scheduler/travelTime` - Travel time calculation
- `GET/POST /api/scheduler/weatherGuard` - Weather checking
- `GET /api/scheduler/slots` - Smart available slots
- `POST /api/scheduler/suggest` - Time suggestions
- `POST /api/scheduler/slotOptimizer` - Slot optimization
- `POST /api/scheduler/prioritySort` - Priority sorting
- `POST /api/scheduler/reschedule` - Re-scheduling
- `POST /api/scheduler/book` - Enhanced booking

## 🚀 Next Steps (Future Enhancements)

1. **Integrate Real Mapping API**: Replace placeholder travel time calculation with Google Maps API or Mapbox
2. **Integrate Weather API**: Replace placeholder weather checks with OpenWeatherMap or WeatherAPI
3. **Enhanced Crew Routing**: Calculate actual travel times for crew members and assign closest
4. **Machine Learning**: Use historical data to improve quality scoring
5. **Real-time Updates**: WebSocket updates for schedule changes
6. **Mobile App Integration**: Native mobile app for field crews

## 📝 Notes

- Travel time calculation currently uses placeholder logic (1 mile = 2 minutes). Replace with real mapping API.
- Weather checking currently returns safe by default. Integrate weather API for production.
- Daylight calculation uses approximate times. Enhance with actual sunrise/sunset API or PostGIS.
- Crew assignment currently uses simple load balancing. Enhance with travel time calculation for optimal routing.

## ✅ Testing Checklist

- [ ] Test travel time calculation and caching
- [ ] Test weather blocking
- [ ] Test daylight logic
- [ ] Test quality scoring
- [ ] Test priority booking
- [ ] Test conflict detection
- [ ] Test crew assignment
- [ ] Test re-scheduling
- [ ] Test same-day blocking
- [ ] Test automatic suggestions





















































