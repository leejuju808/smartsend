# Block 22430 — SmartSend Roofing Material Orders & Supplier Tracking v1

## ✅ Implementation Complete

This feature gives roofers instant visibility into all material orders per job with live status tracking, supplier reliability scoring, auto reminders, and timeline integration.

## 📦 Files Created

### Database Migration (1 file)
- ✅ `supabase/migrations/20250131000000_block22430_material_order_updates_v1.sql`
  - Creates `material_order_updates` table for timeline feed
  - Adds `reliability_score` column to suppliers table
  - Extends `material_orders` status constraint to support new statuses
  - Creates trigger function to automatically log updates to job timeline

### Edge Function (2 files)
- ✅ `supabase/functions/material-update-status/index.ts` - Status update handler
- ✅ `supabase/functions/material-update-status/deno.json` - Deno configuration

### UI Components (3 files)
- ✅ `app/(dashboard)/jobs/[jobId]/components/AddMaterialOrder.tsx` - Drawer for adding material orders
- ✅ `app/(dashboard)/jobs/[jobId]/components/MaterialStatus.tsx` - Status tracker with quick update buttons
- ✅ `app/(dashboard)/jobs/[jobId]/components/JobMaterialsPanel.tsx` - Updated to integrate new components

### API Routes (1 file)
- ✅ `app/api/jobs/material-order/update-status/route.ts` - API endpoint for status updates

### Updated Files (2 files)
- ✅ `app/api/jobs/material-order/route.ts` - Updated to support simple `materials` text field
- ✅ `app/api/jobs/[jobId]/materials/route.ts` - Updated to return `materials` and `cost` fields

## 🎯 Features Implemented

### 1. Material Order Updates Table
- Stores every status update and message for material orders
- Automatically logs to job timeline via database trigger
- Supports statuses: `ordered`, `en_route`, `delivered`, `delayed`, `canceled`

### 2. Add Material Order Drawer
- Supplier dropdown (loads from workspace)
- Material description textarea
- Cost input
- Expected delivery date picker
- Notes field
- Creates order via API

### 3. Material Status Tracker
- Shows current status with colored badge and icon
- Displays supplier info, materials list, cost, delivery dates
- Quick update buttons for status transitions:
  - Ordered → En Route / Delayed / Canceled
  - En Route → Delivered / Delayed
  - Delayed → En Route / Delivered
- Update sheet for adding messages to status changes

### 4. Timeline Integration
- Every material order status update automatically logs to `job_timelines` table
- Timeline messages format: "ABC Supply marked material order as En Route."
- Includes optional message: "Delivery delayed — driver issue. New ETA: Tomorrow 9 AM."

### 5. Status Update API
- POST `/api/jobs/material-order/update-status`
- Updates order status
- Logs to `material_order_updates` table
- Triggers timeline event
- Syncs job material status

## 🔧 Database Schema

### material_order_updates
```sql
- id (uuid)
- material_order_id (uuid, FK to material_orders)
- status (text: ordered, en_route, delivered, delayed, canceled)
- message (text, nullable)
- created_at (timestamptz)
```

### Suppliers (enhanced)
- Added `reliability_score` column (0-100, auto-calculated later)

### material_orders (enhanced)
- Extended status constraint to support both legacy and new statuses
- Supports: `draft`, `ordered`, `confirmed`, `on_truck`, `delivered`, `partial`, `cancelled`, `en_route`, `delayed`, `canceled`

## 🚀 Usage

### Adding a Material Order
1. Navigate to job detail page
2. Click "Add Order" button in Materials panel
3. Fill in supplier, materials description, cost, delivery date
4. Click "Create Order"

### Updating Order Status
1. View material order in Materials panel
2. Click quick update button (e.g., "En Route", "Delivered")
3. Optionally add a message
4. Click "Update Status"
5. Status updates automatically appear in job timeline

## 📋 Status Flow

```
Ordered → En Route → Delivered
  ↓         ↓
Delayed → En Route → Delivered
  ↓
Canceled
```

## 🔐 Security

- All RLS policies enforce workspace-level access
- Users can only view/update orders in their workspace
- API routes verify workspace membership before operations

## 🎨 UI/UX

- Dark theme with zinc color palette
- Status badges with color coding:
  - Ordered: Blue
  - En Route: Purple
  - Delivered: Green
  - Delayed: Amber
  - Canceled: Red
- Icons for each status (Package, Truck, CheckCircle, AlertCircle, X)
- Responsive drawer/sheet components
- Loading states and error handling

## 📝 Next Steps (Future Enhancements)

1. **Supplier Reliability Scoring**: Auto-calculate reliability_score based on delivery performance
2. **Auto Reminders**: Send notifications when deliveries are late
3. **Delivery Tracking**: Integration with shipping APIs for real-time tracking
4. **Material Templates**: Save common material lists for quick ordering
5. **Cost Tracking**: Track actual vs. estimated costs
6. **Multi-Order Support**: Allow multiple orders per job

## 🐛 Known Limitations

- Currently supports one active order per job (simplest v1)
- Materials stored as text description (not structured line items in v1)
- Supplier reliability scoring not yet implemented (column exists, calculation pending)
- No email/SMS notifications for status changes (future enhancement)

## ✅ Testing Checklist

- [ ] Apply database migration
- [ ] Deploy edge function
- [ ] Test adding material order
- [ ] Test updating order status
- [ ] Verify timeline events appear
- [ ] Test with multiple suppliers
- [ ] Verify RLS policies work correctly
- [ ] Test status transitions
- [ ] Verify cost and materials display correctly







































