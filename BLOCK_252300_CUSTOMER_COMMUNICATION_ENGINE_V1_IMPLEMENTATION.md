# Block 252300 — SmartSend Customer Communication Engine v1
## Implementation Complete ✅

**Vision:** Automated Customer Communication System — Makes SmartSend feel like a premium homeowner experience platform, not just a contractor tool.

This is a MASSIVE differentiator. No CRM communicates like this.

---

## 📦 What Was Built

### 1. Database Schema ✅

**File:** `supabase/migrations/20250130000001_block252300_customer_communication_engine_v1.sql`

#### Core Tables

- **`communication_events`** - Tracks all automated messages sent to customers
  - `event_type`: appointment_confirmed, crew_on_way, job_started, material_delivered, job_completed, review_request, photo_update
  - `channel`: sms or email
  - `status`: pending, sent, failed, delivered
  - `metadata`: JSONB for photo URLs, links, etc.

- **`message_templates`** - Editable message templates per company
  - Company-specific templates override system defaults
  - Fully customizable per company
  - Supports template variables: {{customer_name}}, {{date}}, {{foreman_name}}, {{eta}}, etc.

#### Default Templates

System-wide default templates inserted on init:
- Appointment Confirmed
- Crew On The Way
- Job Start (with photo)
- Material Delivered
- Job Complete
- Review Request
- Photo Updates (before/during/after)

#### Helper Functions

- **`send_customer_message()`** - Sends customer message using templates
  - Handles template variable replacement
  - Creates communication event record
  - Ready for Twilio/SendGrid integration

- **`send_review_request()`** - Sends review request to customer
  - Generates review links
  - Called 24 hours after job completion

#### Database Triggers

1. **Appointment Confirmed** - When `job.scheduled_date` is set
2. **Material Delivered** - When `material_delivery_records` is created
3. **Job Started** - When first milestone "Tear-Off" marked in-progress
4. **Job Completed** - When milestone "Job Complete" marked completed
5. **Photo Updates** - When `job_photo_entries` are inserted (before/during/after)

### 2. Job Portal Tokens ✅

**File:** `supabase/migrations/20250130000001_block252300_job_portal_tokens.sql`

- **`job_portal_tokens`** table - Maps short codes to job IDs
- **`generate_job_portal_code()`** - Generates unique 6-character codes
- **`get_job_from_portal_code()`** - Looks up job from code
- Auto-generates portal code when job is approved/scheduled

### 3. API Routes ✅

#### POST `/api/customer/send-message`
**File:** `app/api/customer/send-message/route.ts`

Sends automated customer messages (SMS/Email)
- Validates job and customer info
- Fetches template (company-specific or system default)
- Creates communication event record
- Ready for Twilio/SendGrid integration (TODO)

#### GET `/api/customer/portal/job/[jobId]`
**File:** `app/api/customer/portal/job/[jobId]/route.ts`

Returns portal data for a job (public access via tokenized jobId)
- Validates portal code or job ID
- Returns job info, milestones, photos, messages, timeline
- Includes foreman contact info
- Generates warranty link

### 4. Customer Portal ✅

**File:** `app/customer/portal/[jobId]/page.tsx`

Premium customer portal with NO LOGIN REQUIRED:
- **URL Format:** `smartsend.app/customer/j/ABC123`
- **Overview Tab:** Job status, milestones, contact info
- **Timeline Tab:** All updates and communications
- **Photos Tab:** Before → during → after photos
- **Messages Tab:** All communication events
- **Documents Tab:** Warranty packet, invoices

**Features:**
- Mobile-responsive design
- Real-time updates
- Photo gallery organized by stage
- Timeline of all events
- Foreman contact information
- Warranty packet access

### 5. Review Request Engine ✅

**File:** `supabase/functions/send-review-requests/index.ts`

Edge function that runs daily:
- Finds jobs completed 24 hours ago
- Checks if review request already sent
- Calls `send_review_request()` function
- Supports Google, Yelp, Facebook review links

**To Schedule:**
Set up a cron job or Supabase cron to call this function daily:
```sql
SELECT cron.schedule(
  'send-review-requests',
  '0 10 * * *', -- 10 AM daily
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/send-review-requests',
    headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  );
  $$
);
```

### 6. Photo Update Triggers ✅

Automatically sends photos to customers when crew uploads:
- **Before photos** → "Here's a photo of your roof before we begin work"
- **During photos** → "Progress update: Here's how your roof looks now"
- **After photos** → "Your new roof is complete! Here are the final photos"

Trigger fires on `job_photo_entries` insert.

---

## 🚀 How It Works

### Automated Message Flow

1. **Appointment Confirmed**
   - Office sets `job.scheduled_date`
   - Trigger fires → sends appointment confirmation SMS
   - Customer receives: "Hi {{customer_name}}, your roofing appointment for {{date}} is confirmed..."

2. **Material Delivered**
   - Crew creates `material_delivery_records` entry
   - Trigger fires → sends material delivery notification
   - Customer receives: "Materials have been delivered for your project..."

3. **Job Started**
   - Foreman marks "Tear-Off" milestone as in-progress
   - Trigger fires → sends job started message
   - Customer receives: "Your roofing project has officially begun! Here's a photo..."

4. **Photo Updates**
   - Crew uploads photo with stage (before/during/after)
   - Trigger fires → sends photo update message
   - Customer receives photo with context message

5. **Job Completed**
   - "Job Complete" milestone marked completed
   - Trigger fires → sends completion message with warranty link
   - Customer receives: "Your roofing project is complete! Your warranty packet is available here..."

6. **Review Request**
   - 24 hours after completion, edge function runs
   - Sends review request with Google/Yelp/Facebook links
   - Customer receives: "We enjoyed working on your home! Would you mind leaving a quick review?"

### Customer Portal Access

1. **Auto-Generated Code**
   - When job moves to approved/scheduled, portal code is auto-generated
   - Code format: 6-character alphanumeric (e.g., "ABC123")

2. **Portal URL**
   - Format: `smartsend.app/customer/j/ABC123`
   - No login required
   - Secure tokenized access

3. **Portal Features**
   - Real-time job status
   - Timeline of all events
   - Photo gallery
   - Message history
   - Warranty documents

---

## 📋 TODO: Integration Points

### SMS/Email Provider Integration

The system is ready for Twilio, Plivo, or SendGrid integration:

1. **Update `/api/customer/send-message/route.ts`**
   ```typescript
   // Add Twilio integration
   if (channel === 'sms' && recipient_phone) {
     await twilioClient.messages.create({
       body: message_body,
       from: process.env.TWILIO_PHONE_NUMBER,
       to: recipient_phone,
     });
   }
   ```

2. **Update `send_customer_message()` function**
   - Add actual SMS/Email sending logic
   - Update `communication_events.status` based on send result

### Crew App Integration

**"Crew On The Way" Trigger:**

When foreman clicks "Start Job" in crew app, call:
```typescript
POST /api/customer/send-message
{
  "job_id": "...",
  "event_type": "crew_on_way",
  "template_vars": {
    "eta": "30 minutes"
  }
}
```

Or add trigger to crew app's start job API endpoint.

### Review Links

Update company settings to store:
- Google Review Link
- Yelp Review Link
- Facebook Review Link

Then update `send_review_request()` to use company-specific links.

---

## 🎯 Why This Makes Roofers Feel Stupid Not Using SmartSend

**Before SmartSend:**
- Customers have no clue where crew is
- No updates
- No proof of progress
- No professionalism
- No follow-up → no reviews
- Customers constantly calling "What's going on???"
- Foremen forget to notify office

**With SmartSend:**
- ✔ Appointment confirmation (never lose jobs due to bad communication)
- ✔ Auto updates (homeowners ALWAYS know what's going on)
- ✔ Photo sharing (looks professional, builds trust instantly)
- ✔ Customer portal (zero-routing support calls)
- ✔ Warranty + QC report delivery (customers feel taken care of)
- ✔ Auto review requests (roofers get WAY more 5-star reviews)
- ✔ Communication tracking (office sees EXACTLY what was sent)

**Roofers will say:**
> "SmartSend makes us look elite. Customers think we're the most organized contractor in the city."

This creates MASSIVE word-of-mouth and repeat customers.

---

## 📁 Files Created

1. `supabase/migrations/20250130000001_block252300_customer_communication_engine_v1.sql`
2. `supabase/migrations/20250130000001_block252300_job_portal_tokens.sql`
3. `app/api/customer/send-message/route.ts`
4. `app/api/customer/portal/job/[jobId]/route.ts`
5. `app/customer/portal/[jobId]/page.tsx`
6. `supabase/functions/send-review-requests/index.ts`

---

## ✅ Implementation Status

- [x] Database schema (communication_events, message_templates)
- [x] Default message templates
- [x] Database triggers for automated messages
- [x] Send Message API route
- [x] Customer Portal (tokenized URL)
- [x] Photo update triggers
- [x] Review request engine
- [x] Job update feed in portal
- [ ] SMS/Email provider integration (Twilio/SendGrid)
- [ ] Crew app "Start Job" integration
- [ ] Company-specific review links

---

## 🚀 Next Steps

1. **Integrate SMS Provider** - Add Twilio/SendGrid to actually send messages
2. **Test Triggers** - Verify all triggers fire correctly
3. **Customize Templates** - Allow companies to edit templates in UI
4. **Add Review Links** - Store company review links in settings
5. **Schedule Review Function** - Set up cron job for daily review requests
6. **Crew App Integration** - Add "Crew On The Way" trigger to crew app

---

**This is a MASSIVE differentiator. No CRM communicates like this.**
























