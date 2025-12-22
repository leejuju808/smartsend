# BLOCK 255200 — SmartSend Vendor & Partner Network v1 Implementation

## ✅ Implementation Complete

This block expands SmartSend beyond one roofing company, turning it into a network where vendors, subcontractors, labor resources, and partner companies become connected.

---

## 🗄️ Database Schema

**Migration File:** `supabase/migrations/20250201000000_block255200_vendor_partner_network_v1.sql`

### Tables Created:

1. **`vendor_partners`** - Preferred vendors that roofing companies can add and rate
   - Tracks vendor information, trade type, contact details
   - Performance metrics: rating, responsiveness, accuracy, speed, quality, pricing consistency
   - Supports sharing across organizations

2. **`labor_pool`** - Emergency labor pool - crews and individual workers
   - Skills, experience, certifications
   - Availability tracking
   - Location-based search (latitude/longitude)
   - Verification system with insurance tracking

3. **`partner_jobs`** - Company-to-company resource sharing requests
   - Resource type (crew, equipment, specialty trades)
   - Timing and urgency
   - Budget tracking
   - Matching and completion workflow
   - Bidirectional ratings

4. **`vendor_pricing`** - Vendor pricing data for material comparison
   - Material name, SKU, category
   - Pricing with bulk discounts
   - Stock availability and lead times
   - Price validity periods

5. **`vendor_reviews`** - Reviews and ratings for vendors
   - Overall and category-specific ratings
   - Review text
   - Job references

6. **`labor_reviews`** - Reviews and ratings for labor pool members
   - Overall and skill-specific ratings
   - Review text
   - Job references

### Helper Functions:

- `calculate_vendor_rating(vendor_id)` - Automatically calculates vendor rating from reviews
- `calculate_labor_rating(labor_id)` - Automatically calculates labor rating from reviews
- `update_updated_at_column()` - Auto-updates timestamps

### Triggers:

- Auto-recalculate vendor ratings when reviews are added/updated/deleted
- Auto-recalculate labor ratings when reviews are added/updated/deleted
- Auto-update `updated_at` timestamps

### Row Level Security (RLS):

- Full RLS policies on all tables
- Organization-based access control
- Support for shared resources (visible across organizations)
- Network-wide labor pool (org_id can be null)

---

## 🔌 API Routes

### Vendor Management

#### `GET /api/vendors`
- List vendors with filters: trade, search, include_shared, status
- Returns vendors sorted by rating

#### `POST /api/vendors`
- Create new vendor
- Required: vendor_name, trade

#### `GET /api/vendors/[id]`
- Get vendor details with reviews

#### `PATCH /api/vendors/[id]`
- Update vendor (owner only)

#### `DELETE /api/vendors/[id]`
- Delete vendor (owner only)

#### `POST /api/vendors/[id]/reviews`
- Create or update vendor review
- Automatically triggers rating recalculation

#### `GET /api/vendors/[id]/reviews`
- Get vendor reviews

### Labor Pool

#### `GET /api/labor-pool`
- List labor pool members
- Filters: skill, availability, search, include_shared, verified_only, city, state
- Location-based search with radius (lat/lng)
- Returns distance in miles when coordinates provided

#### `POST /api/labor-pool`
- Add labor pool member
- Required: name, phone, skill

#### `GET /api/labor-pool/[id]`
- Get labor details with reviews

#### `PATCH /api/labor-pool/[id]`
- Update labor (owner or network-wide)

#### `DELETE /api/labor-pool/[id]`
- Delete labor (owner or network-wide)

#### `POST /api/labor-pool/[id]/reviews`
- Create or update labor review
- Automatically triggers rating recalculation

#### `GET /api/labor-pool/[id]/reviews`
- Get labor reviews

### Partner Jobs (Resource Sharing)

#### `GET /api/partner-jobs`
- List partner jobs
- Filters: status, resource_type, my_requests, my_offers, open_only

#### `POST /api/partner-jobs`
- Create partner job request
- Required: job_description, resource_type, needed_on

#### `GET /api/partner-jobs/[id]`
- Get partner job details

#### `PATCH /api/partner-jobs/[id]`
- Update partner job (requester only)
- Special actions: `accept`, `complete`, `cancel`

#### `POST /api/partner-jobs/[id]/feedback`
- Submit feedback/rating after job completion
- Bidirectional: requester rates provider, provider rates requester

### Vendor Pricing

#### `GET /api/vendors/[id]/pricing`
- Get vendor pricing
- Filters: material_name, material_category, valid_only

#### `POST /api/vendors/[id]/pricing`
- Add vendor pricing entry
- Required: material_name, price, unit

#### `GET /api/vendors/pricing/compare`
- Compare pricing across vendors
- Groups by material name
- Shows lowest/highest prices
- Sorted by price (lowest first)
- Includes vendor ratings

---

## 🎯 Key Features

### 1. Preferred Vendor Database
- Add vendors by trade type
- Track performance metrics automatically
- Share vendors across organizations
- Rating system with category breakdowns

### 2. Subcontractor Partner Network
- Labor pool with skills and availability
- Location-based search
- Verification system
- Network-wide or organization-specific

### 3. Emergency Labor Pool System
- Find available labor by skill
- Location-based radius search
- Availability tracking
- Verified profiles

### 4. Company-to-Company Resource Sharing
- Request resources from other companies
- Match with providers
- Track completion and ratings
- Budget tracking

### 5. Vendor Rating & Score Engine
- Automatic calculation from reviews
- Category-specific scores:
  - Responsiveness
  - Accuracy
  - Speed
  - Quality
  - Pricing consistency
- Overall rating (0-100 scale)

### 6. Verified Labor Profiles
- Skills and experience tracking
- Certifications
- Insurance tracking
- Verification status

### 7. Vendor Price Comparison Tool
- Compare prices across vendors
- Group by material name
- Show lowest/highest prices
- Include vendor ratings
- Filter by category

---

## 🔐 Security & Access Control

- All tables have Row Level Security (RLS) enabled
- Organization-based access control
- Shared resources visible to all organizations
- Network-wide labor pool (org_id = null)
- Only owners can modify their resources
- Reviews require access to the vendor/labor

---

## 📊 Rating System

### Vendor Ratings
- Calculated from reviews (1-5 scale, converted to 0-100)
- Category breakdowns:
  - Responsiveness Score
  - Accuracy Score
  - Speed Score
  - Quality Score
  - Pricing Consistency Score
- Automatically updated when reviews are added/updated/deleted

### Labor Ratings
- Calculated from reviews (1-5 scale, converted to 0-100)
- Category breakdowns:
  - Skill Rating
  - Reliability Rating
  - Communication Rating
- Automatically updated when reviews are added/updated/deleted

---

## 🚀 Next Steps (UI Implementation)

The following UI components need to be created:

1. **Vendor Management Dashboard** (`/dashboard/vendors`)
   - List vendors with filters
   - Add/edit vendors
   - View vendor details and reviews
   - Submit reviews

2. **Labor Pool Browser** (`/dashboard/labor-pool`)
   - Browse available labor
   - Filter by skill, location, availability
   - View labor profiles
   - Submit reviews

3. **Partner Marketplace** (`/dashboard/partner-jobs`)
   - View open job requests
   - Create resource requests
   - Accept/complete jobs
   - Submit feedback

4. **Pricing Comparison Tool** (`/dashboard/vendors/pricing/compare`)
   - Search materials
   - Compare prices across vendors
   - View vendor ratings
   - Filter by category

---

## 📝 Notes

- All API routes use organization-based multi-tenancy
- Rating calculations are automatic via database triggers
- Location-based search uses Haversine formula for distance calculation
- Shared resources enable network effects across organizations
- Network-wide labor pool (org_id = null) allows system-wide labor sharing

---

## ✅ Testing Checklist

- [ ] Create vendor and verify rating calculation
- [ ] Add labor pool member and verify location search
- [ ] Create partner job request and match with provider
- [ ] Submit reviews and verify rating updates
- [ ] Compare pricing across multiple vendors
- [ ] Test RLS policies (access control)
- [ ] Test shared resources visibility
- [ ] Test network-wide labor pool access

---

**Implementation Date:** 2025-02-01  
**Block Number:** 255200  
**Status:** ✅ Database & API Complete (UI Pending)





















