# Block 256800 — SmartSend Fleet & Vehicle Management Engine v1 Implementation

## 🎯 Mission

**THIS IS THE COMMAND CENTER FOR ALL ROOFING COMPANY TRUCKS, TRAILERS, DUMP TRAILERS, VANS, AND EQUIPMENT.**

This block makes SmartSend the command center for all roofing company fleet operations. Roofers lose THOUSANDS every year because:
- trucks break down unexpectedly
- oil changes are forgotten
- tires blow out
- tools left in trucks go missing
- no mileage tracking
- fuel receipts lost
- PMs don't know where vehicles are
- crews claim "truck wasn't available"
- DOT compliance fails
- trailers sit unused
- nobody logs damage
- vehicle assignments lost in group chats

**SmartSend fixes EVERY SINGLE PROBLEM.**

---

## ✅ Implementation Complete

### 1. Database Schema ✅

**Migration File:** `supabase/migrations/20250130000001_block256800_fleet_vehicle_management_engine_v1.sql`

#### Core Tables Created/Enhanced:

**A) `vehicles` Table (Extended from Block 252900)**
- Added `vehicle_type`: truck, trailer, dump_trailer, van, equipment
- Added `assigned_to`: Links to crew_members
- Added `mileage`: Current odometer reading
- Added `last_service_date`: Last service date
- Added `next_service_mileage`: Mileage when next service is due
- Enhanced `health_score`: Comprehensive fleet health score (0-100)

**B) `fleet_vehicle_logs` Table**
- Comprehensive logging system for all vehicle activities
- Log types: maintenance, fuel, inspection, gps, damage, assignment, equipment
- JSONB data field for flexible log data
- Links to crew_members and users

**C) `fleet_assignments` Table**
- Vehicle assignment engine linking vehicles to crews, crew members, and PMs
- Tracks assignment status: active, returned, cancelled
- Links to project_managers for assignment tracking
- Prevents double-booking with validation trigger

**D) `vehicle_gps_tracking` Table**
- GPS tracking and live location for vehicles
- Stores latitude, longitude, heading, speed, accuracy
- Location name (human-readable: "On route to Job #1102", "At landfill")
- Supports GPS, AirTag, Bluetooth, and manual tracking
- Indexed for fast location queries

**E) `vehicle_inspections` Table**
- Daily vehicle inspection checklist
- Checklist items: tires, lights, fluids, windshield, ladders, trailer hitch, tools, brakes, mirrors
- Damage reporting with photos and severity levels
- Auto-notifies PM when damage is reported
- Inspection status: pending, passed, failed, needs_attention

**F) `vehicle_equipment` Table**
- Equipment tracking for tools stored in vehicles
- Equipment types: ladder, nail_gun, air_compressor, blower, extension_cord, harness_kit, tool_box, other
- Status tracking: in_vehicle, checked_out, missing, maintenance, retired
- Alerts when equipment goes missing

**G) `vehicle_incidents` Table**
- Damage and incident reports for vehicles
- Incident types: damage, accident, theft, vandalism, mechanical_failure, other
- Severity levels: low, medium, high, critical
- Repair tracking with cost estimates and completion status
- Insurance claim tracking

#### Enhanced Tables:

**H) `fuel_logs` Table (Extended from Block 252900)**
- Added `odometer_reading`: Odometer reading at fill-up
- Added `mpg`: Calculated miles per gallon
- Automatic MPG calculation and efficiency drop detection

---

### 2. GPS Tracking + Live Location ✅

**Features:**
- Real-time GPS tracking for all vehicles
- Live location updates with human-readable location names
- Support for multiple tracking devices (GPS, AirTag, Bluetooth, manual)
- Location history with timestamp tracking
- Integration with jobs for route tracking

**Example Queries:**
```sql
-- Get latest location for all vehicles
SELECT v.name, gps.location_name, gps.tracked_at
FROM vehicles v
LEFT JOIN LATERAL (
  SELECT location_name, tracked_at
  FROM vehicle_gps_tracking
  WHERE vehicle_id = v.id
  ORDER BY tracked_at DESC
  LIMIT 1
) gps ON true;

-- Find vehicles near a location
SELECT v.name, gps.latitude, gps.longitude
FROM vehicle_gps_tracking gps
JOIN vehicles v ON v.id = gps.vehicle_id
WHERE earth_box(ll_to_earth(40.7128, -74.0060), 5000) @> ll_to_earth(gps.latitude, gps.longitude);
```

---

### 3. Maintenance Scheduling & Alerts ✅

**Features:**
- Automatic maintenance alerts based on mileage and date
- Integration with existing `vehicle_maintenance` table from Block 252900
- Alert logging in `fleet_vehicle_logs`
- Maintenance types: oil_change, tire_rotation, inspection, brake_service, filter_replacement, other

**Alert Examples:**
- "Truck #7 needs oil change within 300 miles. Schedule this week."
- "Trailer B: Tire wear detected in inspection photos. Replace within 48 hours."

**Triggers:**
- `trg_maintenance_alert_on_vehicle_update`: Alerts when vehicle mileage is updated
- `trg_maintenance_alert_on_mileage_log`: Alerts when mileage log is created/updated

---

### 4. Daily Vehicle Inspection Checklist ✅

**Features:**
- Comprehensive pre-drive inspection checklist
- Checklist items: tires, lights, fluids, windshield, ladders, trailer hitch, tools, brakes, mirrors
- Damage reporting with photos and severity levels
- Auto-notification to PM when damage is reported
- Inspection status tracking

**Crew App Flow:**
1. Crew member opens inspection checklist
2. Completes all checklist items
3. Reports any damage with photos
4. PM automatically notified if damage found
5. Inspection status recorded

**Example Alert:**
```
⚠️ Damage Reported:
Cracked tail light on Truck #4.
PM notified.
```

---

### 5. Fuel Log System ✅

**Features:**
- Enhanced fuel logging with odometer reading
- Automatic MPG calculation
- Fuel efficiency drop detection
- Integration with existing `fuel_logs` table from Block 252900

**Efficiency Tracking:**
- Tracks previous 5 fill-ups for average MPG
- Detects when current MPG drops below 85% of average
- Logs efficiency alerts automatically

**Example Alert:**
```
Truck #2 — Fuel Efficiency Drop:
Previous: 12.8 MPG
Current: 10.1 MPG
Possible Issue: Tire pressure or engine tune-up needed.
```

---

### 6. Vehicle Assignment Engine ✅

**Features:**
- Links vehicles to crews, crew members, and project managers
- Assignment status tracking: active, returned, cancelled
- Prevents double-booking with validation trigger
- Assignment history with notes
- Integration with jobs

**Assignment Flow:**
1. PM assigns vehicle to crew/member
2. System validates vehicle is available
3. Assignment recorded with timestamp
4. Vehicle status updated
5. Alert if crew tries to take wrong vehicle

**Example Alert:**
```
⚠️ ASSIGNMENT ALERT:
Truck #4 is assigned to Crew C today.
```

---

### 7. Equipment Tracking ✅

**Features:**
- Tracks all equipment stored in vehicles
- Equipment types: ladders, nail guns, air compressors, blowers, extension cords, harness kits, tool boxes
- Status tracking: in_vehicle, checked_out, missing, maintenance, retired
- Missing equipment alerts

**Example Alert:**
```
Missing Equipment:
Crew A did not return Ladder #11 yesterday.
```

---

### 8. Damage + Incident Reports ✅

**Features:**
- Comprehensive incident reporting system
- Incident types: damage, accident, theft, vandalism, mechanical_failure, other
- Severity levels: low, medium, high, critical
- Photo attachments
- Repair tracking with cost estimates
- Insurance claim tracking
- PM notification

**Example Report:**
```
Incident: Truck #2 dent on rear door
Reported by: Carlos
Severity: Low
Photos: Attached
Next Step: Schedule body repair estimate
```

---

### 9. Fleet Health Score Dashboard ✅

**Features:**
- Comprehensive health score calculation (0-100)
- Factors considered:
  - Overdue maintenance (-10 per item)
  - Critical incidents (-15 per incident in last 30 days)
  - Failed inspections (-5 per failure in last 7 days)
  - Missing equipment (-3 per item)
  - Fuel efficiency drops (-5 if >15% drop)

**Dashboard View:**
- `fleet_health_dashboard` view provides comprehensive fleet overview
- Shows: vehicle name, type, status, health score, current location, maintenance alerts, incidents, missing equipment, last inspection

**Example Scores:**
- Truck #3 — Health: 92
- Van #1 — Health: 74 (Needs Tires Soon)
- Dump Trailer — Health: 88
- Trailer C — Health: 63 (Wheel Bearings Overdue)

---

### 10. Row Level Security (RLS) ✅

**Policies Created:**
- All tables have RLS enabled
- Access controlled via `user_belongs_to_company()` function
- Users can only access vehicles from their company
- Policies for SELECT, INSERT, UPDATE operations

**Security Features:**
- Company-based access control
- Crew members can log inspections and fuel
- PMs can assign vehicles and view all data
- Owners/admins have full access

---

## Key Functions

### `calculate_fleet_health_score(vehicle_id)`
Calculates comprehensive fleet health score (0-100) based on maintenance, incidents, inspections, equipment, and fuel efficiency.

### `check_maintenance_alerts()`
Triggers maintenance alerts when mileage exceeds due dates or dates pass.

### `calculate_fuel_efficiency()`
Calculates MPG and detects fuel efficiency drops.

### `notify_pm_on_damage()`
Auto-notifies PM when damage is reported in inspection.

### `alert_missing_equipment()`
Alerts when equipment status changes to missing.

### `validate_vehicle_assignment()`
Prevents double-booking of vehicles.

---

## Integration Points

### With Existing Systems:
- **Block 252900**: Extends existing vehicle fleet management
- **Block 256500**: Integrates with project managers
- **Block 82000**: Links to crews and crew members
- **Block 25820**: Uses roofing_companies structure

### Data Flow:
1. Crew members log inspections → Auto-alerts PM on damage
2. Fuel logs → Auto-calculates MPG → Alerts on efficiency drops
3. GPS tracking → Updates live location → Shows in dashboard
4. Vehicle assignments → Validates availability → Prevents conflicts
5. Equipment tracking → Alerts on missing items → Logs in system
6. Maintenance logs → Calculates health score → Updates dashboard

---

## Usage Examples

### Create Vehicle
```sql
INSERT INTO vehicles (company_id, name, vehicle_type, license_plate, make, model, year)
VALUES ('company-uuid', 'Truck #3', 'truck', 'ABC-123', 'Ford', 'F-250', 2020);
```

### Log GPS Location
```sql
INSERT INTO vehicle_gps_tracking (vehicle_id, latitude, longitude, location_name, job_id)
VALUES ('vehicle-uuid', 40.7128, -74.0060, 'On route to Job #1102', 'job-uuid');
```

### Create Inspection
```sql
INSERT INTO vehicle_inspections (
  vehicle_id, crew_member_id, tires_ok, lights_ok, fluids_ok, 
  windshield_ok, ladders_secured, trailer_hitch_locked, tools_accounted_for,
  inspection_status
)
VALUES ('vehicle-uuid', 'crew-member-uuid', true, true, true, true, true, true, true, 'passed');
```

### Assign Vehicle
```sql
INSERT INTO fleet_assignments (vehicle_id, crew_id, assigned_by, notes)
VALUES ('vehicle-uuid', 'crew-uuid', 'pm-uuid', 'Assigned for Job #1102');
```

### Track Equipment
```sql
INSERT INTO vehicle_equipment (vehicle_id, equipment_type, equipment_name, status)
VALUES ('vehicle-uuid', 'ladder', 'Ladder #11', 'in_vehicle');
```

---

## Why This Makes Roofers Feel Stupid Not Using SmartSend

**Roofers WITHOUT SmartSend:**
- ❌ lose tools
- ❌ trucks break down
- ❌ crews take wrong vehicle
- ❌ no maintenance tracking
- ❌ DOT fines
- ❌ wasted fuel
- ❌ no GPS
- ❌ no inspection logs
- ❌ trailers disappear
- ❌ dump trailers sit unused
- ❌ liability risks skyrocket

**SmartSend AUTOMATES:**
- ✔ GPS tracking
- ✔ maintenance
- ✔ checklists
- ✔ assignments
- ✔ tool tracking
- ✔ incident reports
- ✔ fuel efficiency
- ✔ fleet health scoring

**Roofers will LITERALLY say:**
- "SmartSend runs our fleet better than any human."
- "We stopped losing trucks, tools, and time."
- "Any roofer not using SmartSend is running a sloppy operation."

---

## Next Steps

1. **Frontend Implementation:**
   - Fleet dashboard UI
   - GPS map view
   - Inspection checklist form
   - Assignment interface
   - Equipment tracking UI

2. **Mobile App Integration:**
   - Crew app inspection checklist
   - GPS tracking integration
   - Fuel log photo upload
   - Equipment check-in/out

3. **Automation Enhancements:**
   - Automated GPS updates via device integration
   - Maintenance scheduling automation
   - DOT compliance reporting
   - Insurance claim automation

---

## Migration Notes

- This migration extends the existing `vehicles` table from Block 252900
- All new tables are backward compatible
- RLS policies follow the same pattern as Block 252900
- Functions are idempotent and can be run multiple times safely

---

## End of Block 256800 Implementation

This block gives SmartSend full operational dominance over fleet and equipment.





















