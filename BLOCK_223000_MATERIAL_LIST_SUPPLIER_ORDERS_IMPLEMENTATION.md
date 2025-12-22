# Block 223000 — SmartSend Roofing "Material List Generator + Supplier Order Integration" v1

## ✅ Implementation Complete

This block transforms SmartSend from a CRM into a production command center by turning every signed job into:
- A clean, editable Material List
- One or more Supplier Orders (ABC, Beacon, Local Yard, etc.)
- A Delivery Plan (date, time window, drop location)
- Status tracking inside SmartSend

## 🗄️ Database Schema

### Tables Created

1. **materials** - Catalog of materials used by a company
   - Links to `roofing_companies`
   - Stores name, category, unit, SKU, preferred supplier, default cost

2. **suppliers** - Supplier contacts for material ordering
   - Links to `roofing_companies`
   - Stores name, contact info, delivery notes

3. **material_lists** - Material lists per job
   - Links to jobs and estimates
   - Status: draft, finalized, ordered

4. **material_list_items** - Items in a material list
   - Links to materials and suppliers
   - Stores quantity, unit, waste factor

5. **supplier_orders** - Orders sent to suppliers
   - Links to material lists and suppliers
   - Status: draft, sent, confirmed, scheduled, delivered
   - Stores PO number, delivery date/window, drop location

6. **supplier_order_items** - Items in a supplier order
   - Links to supplier orders and materials

7. **delivery_events** - Delivery tracking events
   - Future-proof for API/webhook integration
   - Tracks scheduled, in_transit, delivered, issue_reported

8. **material_reminders** - Track material ordering reminders sent
   - Prevents duplicate reminders

### Migration File
`supabase/migrations/20250230000002_block223000_material_list_supplier_orders_v1.sql`

## 🔌 API Routes

### Material List APIs

1. **POST /api/materials/list/from-estimate**
   - Generates material list from estimate line items
   - Maps line items to material list items with waste factor
   - Input: `job_id`, `estimate_id`
   - Output: `material_list_id`

2. **POST /api/materials/list/update**
   - Updates material list items (add/remove/edit)
   - Changes suppliers, adjusts waste factors
   - Input: `material_list_id`, `items[]`, `status`, `notes`

3. **GET /api/materials/list/[materialListId]**
   - Gets material list with all items
   - Returns list metadata and items array

### Supplier Order APIs

4. **POST /api/suppliers/orders/create-from-list**
   - Creates supplier orders from material list
   - Groups items by supplier (default: "by_supplier")
   - Input: `material_list_id`, `grouping_rule`
   - Output: `supplier_order_ids[]`

5. **POST /api/suppliers/orders/mark-sent**
   - Marks order as sent with PO number
   - Sets delivery date, window, drop location
   - Input: `supplier_order_id`, `po_number`, `requested_delivery_date`, etc.

6. **POST /api/suppliers/orders/delivery-update**
   - Updates delivery status
   - Creates delivery event
   - Input: `supplier_order_id`, `status` (confirmed/scheduled/delivered), `notes`

## 🎨 Frontend Components

### MaterialListEditor
**File:** `app/(dashboard)/jobs/[jobId]/components/MaterialListEditor.tsx`

Features:
- Generate material list from estimate (one-click)
- Edit material list items (add/remove/edit)
- Assign suppliers to items
- Adjust quantities and waste factors
- Finalize material list

### SupplierOrdersView
**File:** `app/(dashboard)/jobs/[jobId]/components/SupplierOrdersView.tsx`

Features:
- View all supplier orders for a job
- Create orders from material list (auto-groups by supplier)
- Status badges (Draft, Sent, Confirmed, Scheduled, Delivered)
- Click to view order details

### OrderDetailView
**File:** `app/(dashboard)/jobs/[jobId]/components/OrderDetailView.tsx`

Features:
- View order details (supplier, PO, delivery info)
- Mark order as sent (with PO number, delivery date, window, drop location)
- Update delivery status (confirmed → scheduled → delivered)
- View line items

### MaterialsTabV2
**File:** `app/(dashboard)/jobs/[jobId]/components/MaterialsTabV2.tsx`

Main integration component that:
- Loads job data and finds linked estimates
- Renders MaterialListEditor and SupplierOrdersView
- Handles data refresh on updates

## 🔄 Automations

### 1. Auto-Create Material List on Contract Sign
**Trigger:** `trg_contract_signed_material_list`
**Function:** `handle_contract_signed_material_list()`

When a contract is signed:
- Automatically creates a draft material list
- Links to job and estimate
- User can then generate items from estimate

### 2. Reminder if Materials Not Ordered
**Function:** `check_materials_not_ordered_reminder()`

Checks for:
- Jobs with signed contracts (24+ hours ago)
- No material list OR material list not finalized OR no orders sent
- No reminder sent in last 24 hours

Returns list of jobs needing reminders. Call via cron job.

## 📍 Integration Points

### Job Detail Page
**File:** `app/(dashboard)/jobs/[jobId]/page.tsx`

The Materials tab now uses `MaterialsTabV2` component which provides:
- Material list generation from estimates
- Supplier order creation and tracking
- Delivery status management

## 🎯 User Flow

1. **Contract Signed** → Auto-creates draft material list
2. **Generate from Estimate** → One-click material list with items from estimate line items
3. **Edit Material List** → Add/remove items, assign suppliers, adjust quantities
4. **Finalize Material List** → Lock in the list
5. **Create Supplier Orders** → Auto-splits by supplier, creates orders
6. **Mark Order as Sent** → Add PO number, delivery date, window, drop location
7. **Track Delivery** → Update status: confirmed → scheduled → delivered

## 🔐 Security

All tables have Row Level Security (RLS) policies:
- Users can only access materials/suppliers/orders for their companies
- Policies check `roofing_companies.owner_id = auth.uid()`
- Nested policies for related tables (items, events)

## 📊 Status Tracking

Material lists and supplier orders have clear status flows:

**Material Lists:**
- `draft` → `finalized` → `ordered`

**Supplier Orders:**
- `draft` → `sent` → `confirmed` → `scheduled` → `delivered`

## 🚀 Next Steps (Future Blocks)

- Crew Scheduling Dependency: Cannot set crew start date before materials delivered
- Supplier API Integration: Webhook support for delivery updates
- PDF Order Generation: Download/email supplier orders
- Material Cost Tracking: Track actual vs estimated costs
- Inventory Integration: Auto-deduct from inventory when delivered

## ✨ Why This Makes Roofers Feel Stupid Not Using SmartSend

**Before SmartSend:**
- ❌ Build material lists on napkins, not systems
- ❌ Call or text their supplier manually
- ❌ Forget certain items → job delays
- ❌ Don't track deliveries centrally
- ❌ Have no visibility from office → field
- ❌ Lose days because "materials weren't ready"

**With SmartSend:**
- ✔ One-click material list from the estimate
- ✔ Clean, editable list tied to job
- ✔ Auto-split orders by supplier
- ✔ Delivery dates + windows visible to everyone
- ✔ Status for each order and each job
- ✔ Historical record for every job

**Result:** "We've been running a million-dollar company out of a legal pad. We look dumb not using this."

























