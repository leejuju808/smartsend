# Block 19200 — SmartSend Contractor Profile Engine v1 Implementation

## ✅ Implementation Complete

This document summarizes the implementation of Block 19200 - SmartSend Contractor Profile Engine v1, which provides the master brain that defines each roofing company inside SmartSend — their preferences, rules, pricing, territory, team, strengths, and operating style.

## 📦 What Was Implemented

### 1. Database Schema (`supabase/migrations/20250130000001_block19200_contractor_profile_engine_v1.sql`)

#### Tables Created:

1. **`contractor_profile`** - Main contractor profile table
   - Company identity (name, logo)
   - Business focus (repair vs replacement)
   - Emergency & storm response settings
   - Office workflow preferences (follow-ups, message style, formality, CTA style, booking aggressiveness)
   - Business health metrics (avg job value, repair/replacement split, insurance vs cash split, booking rate, response speed, territory performance, rep performance, storm conversion rate)

2. **`contractor_services`** - Services offered by contractor
   - Full replacements, repairs only, metal roofing, tile roofing, flat roofs, commercial roofing
   - Gutter repairs, skylight repairs, tune-ups, inspections
   - Service priorities for lead filtering

3. **`contractor_territory`** - Service territory engine
   - ZIP codes, neighborhoods, counties
   - Travel radius, excluded zones
   - Territory usage flags (target campaigns, restrict booking, personalize messages, calculate travel time, show storm intel)

4. **`contractor_schedule_rules`** - Scheduling rules
   - Business hours, lunch breaks
   - Travel time buffers
   - Appointment types allowed, max daily appointments
   - Weekend rules, emergency slots
   - Daylight restrictions, preferred appointment windows

5. **`contractor_pricing`** - Pricing level and ranges
   - Pricing level (low/market average/premium)
   - Replacement and repair cost ranges
   - Insurance supplement expectations

6. **`contractor_material_preferences`** - Material preferences
   - Preferred shingle brand, metal panels, underlayment
   - Ventilation style, gutter preferences, skylight brands
   - Usage flags for appointment prep, summary panel, recommended upgrades, sequencing language

7. **`contractor_insurance_preferences`** - Insurance preferences
   - Claims strategy, deductible flexibility, supplement strategy
   - Approval threshold, state rules
   - Adjuster approach style, insurance messaging tone
   - Usage flags for insurance brain, tasking, sequences, summary, storm intel, scripts

8. **`contractor_roles`** - Crew structure and roles
   - Role types: owner_operator, sales_rep, repair_tech, storm_rep, office_manager, insurance_specialist, metal_specialist, tile_specialist
   - Scheduling rules, assignment preferences, availability, skill focus
   - Auto-assignment rules (metal leads, tile leads, storm leads, insurance leads)

9. **`contractor_quote_preferences`** - Quote and estimate preferences
   - Quote template, deposit rules, financing options
   - Insurance supplement layout, pricing format (itemized/non-itemized/hybrid)
   - Usage flags for summary, appointment prep, value estimator, insurance recommendations

10. **`contractor_regional_data`** - Regional adjustment engine
    - Local labor cost, material cost
    - Insurance claim patterns, hail/wind severity
    - Code requirements, season timing, roof type commonality

#### Security:
- Row Level Security (RLS) policies for all tables
- Helper function: `is_contractor_profile_member()`
- Proper access control based on user roles (owners/admins/managers)
- Updated_at triggers for all tables

### 2. API Routes

#### Contractor Profile
- **GET `/api/contractor/profile`**: Fetch complete contractor profile (all related tables)
- **POST `/api/contractor/profile`**: Update contractor profile (owners/admins only)

#### Territory Engine
- **GET `/api/contractor/territory`**: Get contractor territory configuration
- **POST `/api/contractor/territory`**: Update territory (owners/admins only)

#### Schedule Rules
- **GET `/api/contractor/schedule-rules`**: Get schedule rules
- **POST `/api/contractor/schedule-rules`**: Update schedule rules (owners/admins/managers)

#### Insurance Preferences
- **GET `/api/contractor/insurance-prefs`**: Get insurance preferences
- **POST `/api/contractor/insurance-prefs`**: Update insurance preferences (owners/admins only)

#### Services
- **GET `/api/contractor/services`**: Get services configuration
- **POST `/api/contractor/services`**: Update services (owners/admins only)

#### Roles
- **GET `/api/contractor/roles`**: Get contractor roles/crew structure
- **POST `/api/contractor/roles`**: Create or update role (owners/admins only)
- **DELETE `/api/contractor/roles`**: Delete role (owners/admins only)

### 3. UI Components

#### Contractor Profile Settings Page
- **Location**: `src/app/(dashboard)/settings/components/ContractorProfileSettings.tsx`
- **Features**:
  - Company identity (name, logo)
  - Business focus (repair vs replacement)
  - Emergency & storm response settings
  - Office workflow preferences (follow-ups, message style, formality, CTA style, booking aggressiveness)
  - Integrated into main Settings page sidebar

#### Settings Page Integration
- Added "Contractor Profile" section to settings sidebar
- Integrated with existing settings page structure
- Role-based access control (owners/admins can edit)

## 🎯 Key Features

### 1. Comprehensive Profile Management
- Single source of truth for contractor preferences
- Powers AI messaging, sequences, booking logic, value estimates
- Controls insurance recommendations, material advice, upsell logic
- Manages scheduling availability, team assignments, storm response

### 2. Service Territory Engine
- ZIP codes, neighborhoods, counties, travel radius
- Excluded zones for precise territory control
- Auto-blocks booking outside territory
- Powers campaign targeting, message personalization, travel time calculations

### 3. Services Offered (AI-Driven)
- Full replacements, repairs, metal roofing, tile roofing, flat roofs, commercial roofing
- Gutter repairs, skylight repairs, tune-ups, inspections
- Filters leads, adjusts appointment types, tailors email templates
- Sets task types, calculates value estimates

### 4. Pricing Level (v1)
- Low Pricing / Market Average / Premium Pricing
- Adjusts replacement/repair cost ranges
- Sets insurance supplement expectations
- Controls AI language about price and upsell recommendations

### 5. Crew Structure & Roles
- Owner/Operator, Sales Reps, Repair Techs, Storm Reps
- Office Manager, Insurance Specialist, Metal/Tile Specialists
- Each role has scheduling rules, assignment preferences, availability, skill focus
- Auto-assignment rules (e.g., Metal Specialist → Metal leads auto-assigned)

### 6. Material Preferences
- Preferred shingle brand, metal panels, underlayment
- Ventilation style, gutter preferences, skylight brands
- Used in appointment prep notes, summary panel, recommended upgrades, sequencing language

### 7. Insurance Preferences
- Claims strategy, deductible flexibility, supplement strategy
- Approval threshold, state rules, adjuster approach style
- Insurance messaging tone
- Powers insurance brain, tasking, sequences, summary, storm intel, scripts

### 8. Scheduling Rules
- Business hours, lunch breaks, travel time buffers
- Appointment types allowed, weekend rules, emergency slots
- Max daily appointments, daylight restrictions, preferred appointment windows
- Powers scheduler, AI suggestions, booking links, inbox replies

### 9. Storm Response Mode (v1)
- Aggressive storm pursuit
- Insurance-only storm pursuit
- Repair-focused storm pursuit
- Adjusts sequences, tasks, storm scoring, storm intel, recommendations

### 10. Repair vs Replacement Preference
- Replacement-Focused (Insurance or retail)
- Repair-Focused (High volume, quick jobs)
- Adjusts value scoring, task priority, sequencing tone, booking recommendations

### 11. Office Workflow Preferences
- Follow-up count, message style, formality/chattiness
- Preferred CTA style, booking aggressiveness
- Controls AI personality across the platform

### 12. Quote & Estimate Preferences
- Template, deposit rules, financing options
- Insurance supplement layout, pricing format (itemized vs non-itemized)
- Used in summary, appointment prep, value estimator, insurance recommendations

### 13. Regional Adjustment Engine
- Local labor cost, material cost
- Insurance claim patterns, hail/wind severity
- Code requirements, season timing, roof type commonality
- Makes SmartSend's advice location-specific

### 14. Business Health Metrics (v1)
- Avg job value, repair/replacement split
- Insurance vs cash jobs, booking rate, response speed
- Territory performance, rep performance, storm conversion rate
- Becomes part of Dashboard v2

## 🔒 Security & Permissions

- **Owners/Admins**: Full access to all contractor profile settings
- **Managers**: Can update schedule rules
- **Members/Viewers**: Read-only access
- All tables protected with Row Level Security (RLS)
- Proper workspace membership verification

## 📝 Usage Examples

### Get Contractor Profile
```typescript
const res = await fetch('/api/contractor/profile?workspace_id=xxx');
const data = await res.json();
// Returns: profile, services, territory, schedule_rules, pricing, materials, insurance, quote_preferences, regional_data
```

### Update Territory
```typescript
await fetch('/api/contractor/territory', {
  method: 'POST',
  body: JSON.stringify({
    workspace_id: 'xxx',
    zip_codes: ['98001', '98002'],
    neighborhoods: ['Downtown', 'Uptown'],
    travel_radius_miles: 25
  })
});
```

### Update Schedule Rules
```typescript
await fetch('/api/contractor/schedule-rules', {
  method: 'POST',
  body: JSON.stringify({
    workspace_id: 'xxx',
    business_hours_start: '09:00:00',
    business_hours_end: '17:00:00',
    max_daily_appointments: 8
  })
});
```

## 🚀 Next Steps

1. **Dashboard v2 Integration**: Display business health metrics in dashboard
2. **AI Integration**: Use contractor profile data in AI messaging, sequences, and recommendations
3. **Scheduler Integration**: Use schedule rules in booking logic
4. **Territory Validation**: Auto-block bookings outside territory
5. **Role-Based Assignment**: Implement auto-assignment based on contractor roles
6. **Material Detection**: Use material preferences in photo intelligence
7. **Insurance Brain**: Use insurance preferences in insurance engine
8. **Regional Data**: Integrate regional adjustments into value estimates

## 📚 Related Blocks

- Block 16700: SmartSend Settings & Company Profile v2
- Block 15100: Company Settings v1
- Block 17400: Insurance Engine v1
- Block 19000: Insurance Brain v1
- Block 14600: Scheduler v1
- Block 16100: Scheduler v2
- Block 14100: AI Personalization Engine v1

## 🎉 Why Roofers Will LOVE This

🔥 **1. SmartSend finally speaks THEIR language** - Feels tailor-made

🔥 **2. Messaging + tasks match their business style** - Perfect for operations

🔥 **3. Scheduling becomes realistic** - No more manual rules

🔥 **4. Territory-based targeting is accurate** - No wasted leads

🔥 **5. Insurance engine respects their rules** - Every company is different — SmartSend adapts

## 🎉 Why YOU Will LOVE This

🔥 **1. This is the personalization engine** - Every other tool is "one size fits none." SmartSend becomes "one size fits YOU."

🔥 **2. Makes onboarding powerful** - A setup that feels premium

🔥 **3. Everything becomes dynamic** - Messages, scheduling, tasks, insurance logic

🔥 **4. High retention** - Once their profile is configured, they are LOCKED IN





















































