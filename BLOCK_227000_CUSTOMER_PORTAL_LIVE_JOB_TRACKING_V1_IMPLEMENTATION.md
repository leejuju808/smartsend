# Block 227000 — SmartSend Roofing "Customer Portal + Live Job Tracking" v1 Implementation

## ✅ Implementation Complete

This block makes SmartSend look like a MULTI-MILLION-DOLLAR PLATFORM. It's the front door of the company that shows every customer their estimate, contract, payments, schedule, photos, progress, and warranty.

**Result:** Roofers will say: "SmartSend makes us look like a $20M company even if we're a $2M company."

## 📦 What Was Built

### 1. Database Migration
**File:** `supabase/migrations/20250131000000_block227000_customer_portal_live_job_tracking_v1.sql`

#### Tables Created:
- **`customer_portal_access`**: Secure portal access tokens (passwordless login)
  - `id` (uuid, primary key)
  - `homeowner_id` (references homeowners)
  - `job_id` (references roofing_jobs or jobs)
  - `access_token` (unique secure token)
  - `last_login` (timestamptz)
  - `expires_at` (optional expiration)
  - `is_active` (boolean)

- **`customer_messages`**: Two-way communication
  - `id` (uuid, primary key)
  - `job_id` (references roofing_jobs)
  - `sender_type` ('homeowner' or 'company')
  - `sender_name`, `sender_email`
  - `message` (text)
  - `read_at` (timestamptz)

- **`customer_notifications`**: Timeline events
  - `id` (uuid, primary key)
  - `job_id` (references roofing_jobs)
  - `event_type` (estimate_sent, contract_signed, deposit_paid, materials_delivered, crew_scheduled, crew_started, crew_finished, photos_uploaded, job_completed, warranty_issued)
  - `title`, `body`
  - `metadata` (jsonb)
  - `created_at` (timestamptz)

#### Functions Created:
- **`create_customer_portal_access(p_homeowner_id, p_job_id, p_expires_in_days)`**: Creates portal access and returns secure token URL

#### Triggers Created:
- **`auto_create_portal_on_contract_sign()`**: Auto-creates portal access when contract is signed
- **`auto_notify_material_delivery()`**: Auto-notifies customer when materials are delivered
- **`auto_notify_crew_scheduled()`**: Auto-notifies customer when crew is scheduled
- **`auto_notify_photos_uploaded()`**: Auto-notifies customer when progress photos are uploaded

#### Security:
- Row Level Security (RLS) policies for team-based access
- Public read access for portal token validation
- Public read/write for messages (portal access)

### 2. API Routes

#### POST `/api/customer/portal/create-access`
- Creates a secure portal access token for a homeowner
- Requires authentication (team member)
- Parameters: `homeowner_id`, `job_id`, `expires_in_days` (optional, default 365)
- Returns: `{ ok: true, access_token, url, id }`

#### GET `/api/customer/portal/:token`
- Returns all portal data for homeowner (public access via token)
- Validates token and updates access tracking
- Returns comprehensive job data:
  - Homeowner details
  - Job info with progress percentage
  - Estimate and contract
  - Payment schedule (invoices)
  - Photos (before, during, after)
  - Messages
  - Timeline (notifications)
  - Production schedule

#### POST `/api/customer/portal/message`
- Customer sends a message (public access via token)
- Parameters: `token`, `message`, `sender_name`, `sender_email`
- Returns: `{ ok: true, message }`

#### GET `/api/customer/portal/timeline?token=...&job_id=...`
- Returns live job timeline (public access via token)
- Combines notifications, contract events, payment events, material delivery, crew logs
- Returns: `{ ok: true, timeline: [...] }`

### 3. Frontend UI

#### Customer Portal Page
**File:** `src/app/portal/[token]/page.tsx`

Premium customer portal with 6 tabs:

1. **Dashboard Tab**
   - Job Summary Card (contract value, progress, status)
   - Next Milestone display
   - Crew Schedule info
   - Progress Milestones checklist

2. **Documents Tab**
   - Estimate view and download
   - Contract view and signature status
   - Download buttons

3. **Payments Tab**
   - Payment Schedule with all invoices
   - Amount, due date, status for each payment
   - "Pay Now" button (Stripe payment links)
   - Status badges (paid, pending, overdue)

4. **Job Timeline Tab**
   - Chronological feed of all events
   - Estimate sent, contract signed, payments, materials, crew, photos, completion
   - Clean timeline UI with dates

5. **Photos Tab**
   - Grouped by category: Before, During, After
   - Grid layout with click-to-view
   - Pulls from crew_photos or job_photos tables

6. **Messages Tab**
   - Two-way chat interface
   - Homeowner ↔ Company messaging
   - Real-time message sending
   - Message history with timestamps

### 4. Automations

#### Auto-create portal on contract sign
- Trigger: `estimates_contracts.status` changes to 'signed'
- Action: Creates `customer_portal_access` record
- Creates notification: "Contract Signed"

#### Auto-notify on material delivery
- Trigger: `supplier_orders.status` changes to 'delivered'
- Action: Creates `customer_notifications` record
- Event: "Materials Delivered"

#### Auto-notify on crew scheduling
- Trigger: `roofing_jobs.production_date` is set
- Action: Creates `customer_notifications` record
- Event: "Crew Scheduled" with date and crew name

#### Auto-notify on photo upload
- Trigger: `crew_photos` or `job_photos` inserted with category in ('before', 'during', 'after')
- Action: Creates `customer_notifications` record
- Event: "Photos Uploaded" (notifies on first photo and every 5th photo per category)

## 🎯 Key Features

### Security
- Passwordless login via secure tokens
- Token expiration support
- Row Level Security (RLS) policies
- Public access only via valid tokens

### User Experience
- Premium, modern UI design
- Mobile-responsive layout
- Real-time updates
- Easy navigation with tabs
- Clear progress indicators

### Automation
- Zero-touch portal creation
- Automatic notifications
- Timeline auto-population
- Photo feed integration

## 📋 Usage

### For Roofers (Team Members)

1. **Create Portal Access**
   ```typescript
   POST /api/customer/portal/create-access
   {
     "homeowner_id": "uuid",
     "job_id": "uuid",
     "expires_in_days": 365
   }
   ```

2. **Send Portal Link to Customer**
   - Use the returned `url` from create-access
   - Format: `https://smartsendhq.com/portal/{token}`
   - Customer clicks link → instant access (no password needed)

### For Homeowners

1. **Access Portal**
   - Click link: `https://smartsendhq.com/portal/{token}`
   - No login required (passwordless)

2. **View Everything**
   - Dashboard: Job summary, progress, next steps
   - Documents: Estimate, contract
   - Payments: View invoices, pay online
   - Timeline: Track all events
   - Photos: See before/during/after photos
   - Messages: Chat with roofing team

## 🔄 Integration Points

### Existing Systems
- **Contracts**: Auto-creates portal on contract sign
- **Invoices**: Displays payment schedule with Stripe links
- **Photos**: Pulls from crew_photos/job_photos
- **Materials**: Notifies on delivery
- **Crew**: Notifies on scheduling
- **Daily Logs**: Timeline events from crew logs

### Future Enhancements
- Change order approvals (future block)
- Warranty documents
- Crew arrival ETA (future automation)
- Photo uploads from homeowner
- SMS notifications

## 🚀 Deployment

1. **Run Migration**
   ```bash
   supabase migration up 20250131000000_block227000_customer_portal_live_job_tracking_v1
   ```

2. **Verify API Routes**
   - Test `/api/customer/portal/create-access` (requires auth)
   - Test `/api/customer/portal/:token` (public)
   - Test `/api/customer/portal/message` (public)
   - Test `/api/customer/portal/timeline` (public)

3. **Test Portal UI**
   - Navigate to `/portal/{token}` with a valid token
   - Verify all tabs work
   - Test message sending
   - Verify photo display

## 📊 Impact

### For Roofers
- ✅ Professional customer experience
- ✅ Reduced phone calls ("when are they coming?")
- ✅ Faster payments (direct payment links)
- ✅ Better trust and reviews
- ✅ Higher close rates

### For Homeowners
- ✅ Complete transparency
- ✅ Easy access (no passwords)
- ✅ Real-time updates
- ✅ Photo archive
- ✅ Direct communication
- ✅ Online payments

## 🎉 Result

**"SmartSend makes us look like a $20M company even if we're a $2M company."**

This block alone closes customers at HIGHER PRICES because it demonstrates professionalism, transparency, and trust.

























