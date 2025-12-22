# Block 256200 — SmartSend AI Inventory & Yard Management v1 Implementation

## 🎯 Mission

**THIS IS THE MATERIAL CONTROL CENTER THAT ROOFING COMPANIES HAVE NEVER HAD — ZERO FLUFF.**

This block turns SmartSend into an AI-driven inventory system that:
- Keeps the yard stocked
- Eliminates shortages
- Stops material theft
- Saves THOUSANDS per year

## ✅ Implementation Complete

### 1. Database Schema ✅

**File:** `supabase/migrations/20250201000000_block256200_inventory_yard_management_v1.sql`

#### Core Tables Created:

**A) `yard_items` Table**
- Tracks ALL materials in the yard
- Fields:
  - `material_name`: "Timberline HDZ Weathered Wood", "Synthetic Underlayment", etc.
  - `material_category`: "shingles", "underlayment", "ventilation", "flashing", etc.
  - `unit`: "bundle", "roll", "ft", "lb", "gallon", "box"
  - `quantity`: Current quantity in yard
  - `min_quantity`: Minimum threshold before restock alert
  - `max_quantity`: Maximum capacity (optional)
  - `brand`, `color`, `sku`: Material details
  - `cost_per_unit`: Average cost for costing
  - `supplier_name`: Primary supplier
  - `location`: Yard location (optional)

**B) `yard_transactions` Table**
- Tracks ALL material movements
- Transaction types: `check_in`, `check_out`, `adjustment`, `return`, `damage`, `theft`
- Links to jobs, crews, crew members
- Tracks variance (expected vs actual) for shrinkage detection
- Auto-calculates variance percentage

**C) `yard_forecasting` Table**
- AI-powered material usage forecasting
- Fields:
  - `projected_usage`: Projected quantity needed
  - `forecast_date`: Date for this forecast
  - `days_ahead`: How many days ahead
  - `jobs_count`: Number of jobs in period
  - `historical_avg`: Historical average usage
  - `seasonality_factor`: Seasonal adjustment
  - `storm_probability`: Storm impact (0-1)
  - `confidence_score`: AI confidence (0-1)

**D) `yard_restock_alerts` Table**
- Automated restock alerts
- Alert types: `low_stock`, `critical_stock`, `upcoming_demand`, `supplier_outage`, `price_alert`
- Priority levels: `low`, `medium`, `high`, `critical`
- Includes recommended order quantity
- Tracks supplier availability and delivery dates

**E) `yard_shrinkage_alerts` Table**
- Shrinkage and theft detection
- Alert types: `missing_items`, `chronic_overuse`, `suspicious_pattern`, `variance_threshold`, `after_hours_checkout`, `no_job_assigned`
- Severity levels: `low`, `medium`, `high`, `critical`
- Tracks variance, estimated loss amount
- Pattern detection for chronic issues

**F) `yard_reconciliation` Table**
- End-of-day yard reconciliation summaries
- Daily/weekly/monthly reconciliation
- Summary metrics:
  - Total transactions, check-ins, check-outs
  - Items missing, damaged, returned
  - Total variance amount
  - Inventory balance percentage
  - Shrinkage alerts count
  - Estimated loss total

**G) `yard_job_allocation` Table**
- Tracks material allocation from yard to jobs
- Status: `allocated`, `checked_out`, `returned`, `cancelled`
- Links to checkout and return transactions
- Tracks returned quantity vs allocated

#### Database Features:

- **Auto-Update Triggers:**
  - `update_yard_item_quantity()`: Auto-updates yard item quantity on transaction
  - `calculate_transaction_variance()`: Auto-calculates variance for transactions
  - `check_low_stock_alerts()`: Auto-creates restock alerts when stock is low
  - `detect_shrinkage_patterns()`: Auto-detects shrinkage patterns

- **Row Level Security (RLS):**
  - Full RLS policies on all tables
  - Company-based access control
  - Helper function: `has_yard_access(company_id)`

- **Indexes:**
  - Performance indexes on all foreign keys
  - Indexes for low stock queries
  - Indexes for variance detection
  - Indexes for date-based queries

---

## 🔌 API Routes

### Yard Inventory Management

#### `GET /api/yard/items`
- List yard items for a company
- Query params: `company_id` (required), `category`, `low_stock_only`, `is_active`
- Returns: Array of yard items

#### `POST /api/yard/items`
- Create a new yard item
- Required: `company_id`, `material_name`, `unit`
- Optional: `material_category`, `quantity`, `min_quantity`, `max_quantity`, `brand`, `color`, `sku`, `cost_per_unit`, `supplier_name`, `location`, `notes`

#### `GET /api/yard/items/[id]`
- Get a single yard item

#### `PATCH /api/yard/items/[id]`
- Update a yard item
- Supports all fields

#### `DELETE /api/yard/items/[id]`
- Soft delete (sets `is_active` to false)

### Yard Transactions

#### `GET /api/yard/transactions`
- List yard transactions
- Query params: `company_id` (required), `yard_item_id`, `job_id`, `crew_id`, `transaction_type`, `limit`, `offset`
- Returns: Array of transactions with related data

#### `POST /api/yard/transactions`
- Create a new transaction
- Required: `company_id`, `yard_item_id`, `transaction_type`, `quantity`
- Optional: `job_id`, `crew_id`, `crew_member_id`, `notes`, `expected_quantity`
- Transaction types: `check_in`, `check_out`, `adjustment`, `return`, `damage`, `theft`

### Material Check-In/Check-Out

#### `POST /api/yard/checkout`
- Check out materials for a job/crew
- Required: `company_id`, `materials` (array of `{yard_item_id, quantity, expected_quantity?}`)
- Optional: `job_id`, `crew_id`, `crew_member_id`, `notes`
- Creates transactions and job allocations

#### `POST /api/yard/checkin`
- Check in materials (returns, new stock, adjustments)
- Required: `company_id`, `yard_item_id`, `quantity`
- Optional: `transaction_type` (`check_in` or `return`), `job_id`, `crew_id`, `crew_member_id`, `notes`
- Updates job allocations if returning materials

### Restock Alerts

#### `GET /api/yard/alerts/restock`
- Get restock alerts for a company
- Query params: `company_id` (required), `status` (default: `active`), `priority`
- Returns: Array of restock alerts with yard item details

#### `PATCH /api/yard/alerts/restock`
- Update restock alert status
- Body: `alert_id`, `status`, `acknowledged`
- Statuses: `active`, `acknowledged`, `ordered`, `resolved`, `dismissed`

### Shrinkage Alerts

#### `GET /api/yard/alerts/shrinkage`
- Get shrinkage alerts for a company
- Query params: `company_id` (required), `status` (default: `active`), `severity`, `crew_id`
- Returns: Array of shrinkage alerts with related data

#### `PATCH /api/yard/alerts/shrinkage`
- Update shrinkage alert
- Body: `alert_id`, `status`, `investigation_notes`
- Statuses: `active`, `investigating`, `resolved`, `dismissed`, `false_positive`

### Material Forecasting

#### `GET /api/yard/forecast`
- Get material forecasts for a company
- Query params: `company_id` (required), `material_name`, `days_ahead` (default: 14), `start_date`
- Returns: Forecasts array and summary grouped by material

#### `POST /api/yard/forecast`
- Create/update material forecasts
- Required: `company_id`, `material_name`, `projected_usage`, `forecast_date`
- Optional: `material_category`, `days_ahead`, `jobs_count`, `historical_avg`, `seasonality_factor`, `storm_probability`, `forecast_method`, `confidence_score`

### Yard Reconciliation

#### `GET /api/yard/reconciliation`
- Get reconciliation summary for a date
- Query params: `company_id` (required), `reconciliation_date` (default: today), `period_type` (default: `daily`)

#### `POST /api/yard/reconciliation`
- Create/run end-of-day reconciliation
- Required: `company_id`
- Optional: `reconciliation_date` (default: today), `period_type` (default: `daily`)
- Calculates summary metrics and creates reconciliation record

### Yard → Job Allocation

#### `POST /api/yard/allocate`
- Allocate materials from yard to a job
- Required: `company_id`, `job_id`, `materials` (array of `{yard_item_id, quantity, expected_quantity?}`)
- Optional: `crew_id`, `crew_member_id`, `notes`
- Creates allocations and verifies sufficient stock
- Returns allocation summary with status for each material

---

## 🎨 Key Features

### 1. Yard Inventory Tracking System ✅
- Tracks EVERYTHING in the yard:
  - Shingles, ridge, starter, nails
  - Felt/synthetic, ice & water
  - Vents, pipe boots, flashing
  - Sealant, drip edge
- Real-time quantity tracking
- Material categorization
- Location tracking (optional)

### 2. AI Restock Alerts ✅
- Monitors supply levels AND upcoming job demand
- Auto-creates alerts when stock is low
- Calculates recommended order quantity
- Tracks supplier availability
- Priority-based alerting (low, medium, high, critical)

### 3. Yard → Job Material Allocation ✅
- Allocates materials when scheduling a job
- Checks yard first before ordering
- Auto-updates yard inventory
- Tracks allocation status
- Links to checkout/return transactions

### 4. Material Check-In / Check-Out Workflow ✅
- Crew must log bundles taken/returned
- Tracks nails, vents, ridge used
- Updates yard + job costing instantly
- Links to jobs and crews
- Supports returns and adjustments

### 5. Shrinkage & Theft Detection ✅
- Automatically detects material misuse:
  - Missing items (expected vs actual)
  - Chronic overuse patterns
  - Suspicious patterns (after hours, no job assigned)
  - Variance threshold alerts
- Calculates estimated loss amount
- Pattern detection for chronic issues
- Severity-based alerting

### 6. Material Forecasting ✅
- AI predicts future material needs
- Analyzes:
  - Upcoming schedule
  - Historical usage
  - Seasonality
  - Storm probability
- Forecast confidence scoring
- Grouped summaries by material

### 7. End-of-Day Yard Reconciliation ✅
- Daily summary of yard activity
- Tracks:
  - Items missing, damaged, returned
  - Total variance amount
  - Inventory balance percentage
  - Shrinkage alerts count
  - Estimated loss total
- Human-readable summary text

### 8. Supplier Sync (Foundation) ✅
- Database structure supports supplier integration
- Tracks supplier name per material
- Alert system includes supplier availability
- Ready for API integration with suppliers

---

## 🔄 Auto-Triggers & Functions

### Quantity Updates
- **`update_yard_item_quantity()`**: Auto-updates yard item quantity when transactions are created
- Handles check-in (add), check-out (subtract), adjustments, returns

### Variance Calculation
- **`calculate_transaction_variance()`**: Auto-calculates variance and variance percentage
- Compares expected_quantity vs actual quantity

### Low Stock Alerts
- **`check_low_stock_alerts()`**: Auto-creates restock alerts when quantity <= min_quantity
- Calculates recommended order quantity based on upcoming demand
- Sets priority based on stock level

### Shrinkage Detection
- **`detect_shrinkage_patterns()`**: Auto-detects shrinkage when variance exceeds threshold
- Creates alerts for:
  - Missing items
  - After-hours checkouts
  - No job assigned
- Calculates estimated loss amount

---

## 🔒 Security

- **Row Level Security (RLS)** enabled on all tables
- Company-based access control
- Helper function `has_yard_access(company_id)` checks:
  - Company owner
  - Team members with access to company jobs
- All API routes require authentication

---

## 📊 Example Usage

### Example 1: Check Out Materials for Job
```typescript
POST /api/yard/checkout
{
  "company_id": "uuid",
  "job_id": "uuid",
  "crew_id": "uuid",
  "materials": [
    {
      "yard_item_id": "uuid",
      "quantity": 31,
      "expected_quantity": 31
    },
    {
      "yard_item_id": "uuid",
      "quantity": 6,
      "expected_quantity": 6
    }
  ]
}
```

### Example 2: Return Materials
```typescript
POST /api/yard/checkin
{
  "company_id": "uuid",
  "yard_item_id": "uuid",
  "quantity": 3,
  "transaction_type": "return",
  "job_id": "uuid"
}
```

### Example 3: Get Restock Alerts
```typescript
GET /api/yard/alerts/restock?company_id=uuid&status=active&priority=critical
```

### Example 4: Run Reconciliation
```typescript
POST /api/yard/reconciliation
{
  "company_id": "uuid",
  "reconciliation_date": "2025-01-30",
  "period_type": "daily"
}
```

---

## 🚀 Next Steps (Frontend)

1. **Yard Inventory Dashboard**
   - List all yard items with quantities
   - Low stock indicators
   - Quick add/edit items
   - Filter by category

2. **Material Check-Out Interface**
   - Select job and crew
   - Add materials with quantities
   - Show available stock
   - Preview allocation

3. **Material Check-In Interface**
   - Return materials from jobs
   - Add new stock
   - Record adjustments

4. **Alerts Dashboard**
   - Restock alerts with priority
   - Shrinkage alerts with severity
   - Quick actions (acknowledge, order, dismiss)

5. **Forecasting View**
   - Material usage forecast
   - Upcoming jobs impact
   - Recommended orders

6. **Reconciliation View**
   - Daily reconciliation summary
   - Variance reports
   - Shrinkage analysis

---

## 💡 Why This Makes Roofers Feel Stupid Not Using SmartSend

**Roofers WITHOUT SmartSend:**
- ❌ Lose materials
- ❌ Waste bundles
- ❌ Crews over-take shingles
- ❌ No accurate yard counts
- ❌ Shortages delay jobs
- ❌ No forecasting
- ❌ Over-ordering / under-ordering
- ❌ Theft never detected
- ❌ Profit leaks everywhere

**SmartSend AUTOMATES:**
- ✔ Inventory tracking
- ✔ Yard → job allocation
- ✔ Forecasting
- ✔ Shrinkage alerts
- ✔ Restock alerts
- ✔ Theft detection
- ✔ End-of-day reconciliation

**Roofers will literally say:**
- "SmartSend saved us THOUSANDS in material waste."
- "Our yard is finally under control."
- "Any roofer not using SmartSend is bleeding money."

---

## 📝 Files Created

1. **Database Migration:**
   - `supabase/migrations/20250201000000_block256200_inventory_yard_management_v1.sql`

2. **API Routes:**
   - `app/api/yard/items/route.ts`
   - `app/api/yard/items/[id]/route.ts`
   - `app/api/yard/transactions/route.ts`
   - `app/api/yard/checkout/route.ts`
   - `app/api/yard/checkin/route.ts`
   - `app/api/yard/alerts/restock/route.ts`
   - `app/api/yard/alerts/shrinkage/route.ts`
   - `app/api/yard/forecast/route.ts`
   - `app/api/yard/reconciliation/route.ts`
   - `app/api/yard/allocate/route.ts`

3. **Documentation:**
   - `BLOCK_256200_INVENTORY_YARD_MANAGEMENT_V1_IMPLEMENTATION.md`

---

## ✅ Implementation Status

- ✅ Database schema (7 tables)
- ✅ Auto-triggers and functions
- ✅ Row Level Security (RLS)
- ✅ API routes (10 endpoints)
- ⏳ Frontend components (pending)
- ⏳ Supplier sync integration (pending)

---

**This block makes SmartSend the material control system roofing companies have ALWAYS needed.**





















