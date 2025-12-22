# Block 93000 — Lead Attribution + Multi-Channel Source Tracking Engine v1

## Implementation Complete ✅

The comprehensive Lead Attribution and Multi-Channel Source Tracking Engine has been fully implemented, transforming SmartSend into a marketing analytics system for roofing companies.

## What Was Implemented

### 1. Database Schema (Already Exists)
**File**: `supabase/migrations/20250131000000_block93000_lead_attribution_multi_channel_tracking_v1.sql`

The migration includes:
- `lead_sources` table - Tracks all lead generation channels
- `lead_campaigns` table - Tracks specific campaigns
- `lead_attributions` table - Core attribution engine linking leads to sources/campaigns
- `qr_codes` table - QR code tracking for offline marketing
- `attribution_touchpoints` table - Multi-touch attribution history
- Analytics views for source and campaign performance
- Database triggers for auto-attribution and revenue updates

### 2. Backend Attribution Logic
**File**: `lib/attribution/attribution-helpers.ts`

Functions created:
- `autoAttributeLead()` - Auto-create or update attribution for a lead
- `attributeFromEmailReply()` - Attribute leads from cold email replies
- `attributeFromPhoneCall()` - Attribute leads from phone calls
- `attributeFromWebsiteForm()` - Attribute leads from website forms
- `attributeFromQRCode()` - Attribute leads from QR code scans
- `attributeFromReferral()` - Attribute leads from referrals
- `updateAttributionRevenue()` - Update revenue when jobs are won

### 3. API Endpoints

#### Attribution API (`/api/attribution`)
- GET - Get attribution data (sources, campaigns, performance)
- POST - Create or update attribution

#### Dashboard API (`/api/attribution/dashboard`)
- GET - Returns aggregated metrics for dashboard (totals, source performance, campaign performance, time series)

#### QR Codes API (`/api/attribution/qr-codes`)
- GET - List QR codes
- POST - Create QR code
- PATCH - Update QR code

#### QR Code Scan Handler (`/api/attribution/qr-codes/[id]/scan`)
- POST - Tracks QR code scans and creates/updates lead attribution

#### Seed Sources API (`/api/attribution/seed-sources`)
- POST - Creates default lead sources for a workspace

### 4. Frontend Dashboard Pages

#### Attribution Dashboard (`/attribution`)
**File**: `app/(dashboard)/attribution/page.tsx`

Main page with tabs for:
- Source Performance
- Campaign Performance
- QR Code Management

#### Attribution Dashboard Component
**File**: `app/(dashboard)/attribution/_components/AttributionDashboard.tsx`

Displays:
- KPI cards (Total Leads, Booked Estimates, Total Revenue, Cost Per Job)
- Source performance table with ROI, close rates, and revenue metrics

#### Campaign Performance Table
**File**: `app/(dashboard)/attribution/_components/CampaignPerformanceTable.tsx`

Shows campaign-level metrics:
- Leads, booked estimates, jobs won
- Revenue, cost, ROI
- Close rates

#### QR Code Manager
**File**: `app/(dashboard)/attribution/_components/QRCodeManager.tsx`

Features:
- Create QR codes with labels
- Track scans, leads generated, jobs won, revenue
- Download QR code images
- Copy QR code URLs

### 5. Integration Points

#### Email Reply Attribution
**File**: `src/app/api/inbound/reply/route.ts`

Added auto-attribution when email replies are received:
- Detects campaign from email log
- Creates/updates lead attribution
- Links to "Cold Email" source

#### Lead Creation Attribution
**File**: `app/api/v1/leads/route.ts`

Added attribution support when leads are created via API:
- Supports QR code attribution
- Website form attribution with UTM parameters
- Generic source/campaign attribution

#### Job Revenue Attribution
**Database Trigger**: Already implemented in migration

The `update_attribution_revenue()` function automatically:
- Updates attribution revenue when jobs are completed
- Recalculates ROI
- Works with both `roofing_jobs` and `jobs` tables

## Features

### Auto-Tagging
Every lead is automatically tagged with:
- Source (Cold Email, Phone Call, Website Form, QR Code, Referral, etc.)
- Campaign (if applicable)
- Offer (if applicable)
- Landing page URL
- UTM parameters
- First touch and last touch timestamps
- Multi-touch count

### Revenue Attribution
- Revenue automatically attributed when jobs are won
- ROI calculated per source and campaign
- Cost per booked estimate tracked
- Cost per job tracked

### QR Code Tracking
- Generate QR codes for yard signs, door hangers, trucks
- Track scans, unique scans, leads generated
- Track jobs won and revenue from QR codes
- Download QR code images

### Analytics Views
- Source performance with revenue, ROI, close rates
- Campaign performance with conversion metrics
- Time-series data for trend analysis

## How It Works

1. **Lead Creation**: When a lead is created, attribution is automatically created (via database trigger or API)

2. **Email Replies**: When a reply is received, the system:
   - Finds the email log and campaign
   - Creates/updates attribution with "Cold Email" source
   - Links to the campaign

3. **Job Completion**: When a job is marked complete:
   - Database trigger fires
   - Revenue is added to attribution
   - ROI is recalculated

4. **QR Code Scans**: When a QR code is scanned:
   - Scan count incremented
   - Lead attribution created/updated
   - Touchpoint recorded

## Next Steps

1. **Run Migration**: Ensure the migration `20250131000000_block93000_lead_attribution_multi_channel_tracking_v1.sql` has been applied

2. **Seed Default Sources**: Call `/api/attribution/seed-sources` to create default lead sources for existing workspaces

3. **Access Dashboard**: Navigate to `/attribution` to view the attribution dashboard

4. **Generate QR Codes**: Use the QR Code Manager to create QR codes for offline marketing

## Database Functions

The migration includes helper functions:
- `auto_create_lead_attribution()` - Auto-creates attribution on lead creation
- `update_attribution_revenue()` - Updates revenue when jobs are completed
- `seed_default_lead_sources()` - Seeds default sources for a workspace

## Analytics Views

- `v_lead_source_performance` - Aggregated source metrics
- `v_campaign_performance` - Aggregated campaign metrics

These views are used by the dashboard to display performance data.

## Notes

- Attribution is automatically created for all new leads
- Revenue attribution happens automatically via database triggers
- QR codes use a public API service for generation (can be replaced with local library)
- All attribution data is scoped to workspaces with proper RLS policies



























