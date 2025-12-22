# Block 37990 — SmartSend Roofing "AI Change Order Engine + Scope Adjustment System" v1

## Implementation Complete ✅

This block implements a complete change order system that:
- Auto-detects mid-job changes from photos and notes
- AI-generates professional change order descriptions
- Gets homeowner approval via SMS (reply YES)
- Automatically updates job contract value and profit
- Provides full change order history and dashboard metrics

## Files Created

### Database
- `supabase/migrations/20250130000001_block37990_ai_change_order_engine_v1.sql`
  - `change_orders` table
  - `change_order_photos` table
  - `increment_job_value()` RPC function
  - Auto-update trigger when change order approved
  - Row-level security policies

### API Routes
- `src/app/api/change-orders/generate/route.ts` - AI change order generator
- `src/app/api/change-orders/send-approval/route.ts` - Send SMS approval request
- `src/app/api/change-orders/approve/route.ts` - Handle approval
- `src/app/api/change-orders/detect-sms-approval/route.ts` - Detect YES from SMS

### Libraries
- `src/lib/change-orders/auto-detect.ts` - Auto-detection logic for scope changes

### UI Components
- `app/(dashboard)/production/jobs/[jobId]/components/ChangeOrderPanel.tsx` - Change order list view
- `app/(dashboard)/production/jobs/[jobId]/components/CreateChangeOrderDialog.tsx` - Create change order dialog
- `app/(dashboard)/dashboard/components/ChangeOrderMetrics.tsx` - Dashboard metrics

### Integration
- Updated `app/api/sms/inbound/route.ts` - Added YES detection for change order approvals
- Updated `app/(dashboard)/production/jobs/[jobId]/components/JobDetailView.tsx` - Added Change Orders tab

## Features Implemented

### 1. AI Change Order Generation
- Uses OpenAI GPT-4o-mini to generate professional descriptions
- Estimates cost based on issue type (rot, extra layer, flashing, etc.)
- Includes photos in change order

### 2. SMS Approval Workflow
- Sends SMS to homeowner: "Hi [Name], we discovered [issue]. Additional cost is $X. Reply YES to approve."
- Detects "YES" replies automatically
- Updates change order status to approved
- Triggers automatic job contract value update

### 3. Auto-Detection
- Detects keywords in crew notes: "rot", "rotten", "damaged decking", "extra layer", etc.
- Detects photos labeled "issue"
- Can detect homeowner upgrade requests from inbox

### 4. Automatic Contract Value Update
- When change order approved, job `contract_value` is automatically incremented
- Uses database trigger for reliability
- Profit recalculates automatically

### 5. Change Order History
- Full timeline of all change orders per job
- Shows status (pending/approved/rejected)
- Displays photos
- Shows total added revenue

### 6. Dashboard Metrics
- Total added revenue from change orders
- Approval rate
- Pending count
- Average change order value

## Usage

### Create Change Order
1. Go to Job Detail page
2. Click "Change Orders" tab
3. Click "Create Change Order"
4. Enter issue description (e.g., "Discovered rotten decking")
5. Optionally upload photos
6. AI generates description and estimates cost
7. Click "Send Approval Request" to text homeowner

### Homeowner Approval
1. Homeowner receives SMS: "Hi [Name], we discovered [issue]. Additional cost is $X. Reply YES to approve."
2. Homeowner replies "YES"
3. System automatically:
   - Approves change order
   - Updates job contract value
   - Sends confirmation SMS

### Auto-Detection
- When crew uploads photo labeled "issue", system can auto-create change order
- When crew notes contain keywords like "rot" or "extra layer", system can auto-create change order
- (Auto-creation requires additional integration with photo upload and notes endpoints)

## Database Schema

```sql
change_orders
- id (uuid)
- job_id (uuid) → jobs(id)
- description (text) - AI-generated
- amount (numeric)
- status (pending/approved/rejected)
- details (jsonb) - issue text, AI metadata
- created_at, approved_at, rejected_at

change_order_photos
- id (uuid)
- change_order_id (uuid) → change_orders(id)
- photo_url (text)
- label (text)
```

## API Endpoints

### POST /api/change-orders/generate
```json
{
  "job_id": "uuid",
  "issue_text": "Discovered rotten decking",
  "photos": [{"url": "...", "label": "issue"}]
}
```

### POST /api/change-orders/send-approval
```json
{
  "change_order_id": "uuid"
}
```

### POST /api/change-orders/approve
```json
{
  "change_order_id": "uuid",
  "lead_id": "uuid" // optional, finds most recent pending
}
```

## Next Steps (Future Enhancements)

1. **Photo Upload Integration**: Connect photo upload to auto-create change orders
2. **Email Approval**: Add email approval option (currently SMS only)
3. **PDF Generation**: Generate PDF change order documents
4. **Material/Labor Breakdown**: More detailed cost estimation
5. **Homeowner Portal**: Allow homeowners to view/approve change orders online
6. **Crew Mobile App**: Direct change order creation from field app
7. **Insurance Integration**: Link change orders to insurance claims

## Testing

1. Create a test job
2. Create a change order via UI
3. Send approval request
4. Reply "YES" via SMS
5. Verify job contract value updated
6. Check dashboard metrics

## Notes

- SMS approval detection is integrated into main SMS inbound handler
- Change orders automatically update job contract value via database trigger
- AI cost estimation is basic (v1) - can be enhanced with material/labor calculations
- Photo upload in dialog is placeholder - needs integration with storage
































