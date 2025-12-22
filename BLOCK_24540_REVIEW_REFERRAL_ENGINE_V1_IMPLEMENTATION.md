# Block 24540 — SmartSend Roofing Review & Referral Engine v1

## Overview

This block transforms SmartSend into a growth multiplier, turning completed jobs into:
- ✔ 5-star Google reviews
- ✔ referrals from neighbors
- ✔ repeat business
- ✔ long-term homeowner trust

When a job hits "installed" stage, SmartSend automatically activates this engine.

## Implementation Summary

### Database Schema (`supabase/migrations/20250204000000_block_24540_review_referral_engine_v1.sql`)

#### Tables Created:
1. **`review_links`** - Stores Google, Facebook, BBB review links per workspace
2. **`review_referral_sequences`** - Tracks which leads are enrolled in sequences
3. **`review_referral_messages`** - Stores scheduled messages for sequences
4. **`reviews_tracked`** - Tracks when reviews are actually left
5. **`referrals_tracked`** - Tracks referrals generated from homeowners
6. **`negative_sentiment_logs`** - Tracks negative responses that trigger cancellation

#### Functions Created:
1. **`start_review_referral_sequence(p_lead_id)`** - Starts sequence when job is installed
2. **`detect_negative_sentiment(p_lead_id, p_message_text, p_sentiment_score)`** - Detects negative sentiment and cancels sequence
3. **`get_review_referral_dashboard(p_workspace_id)`** - Returns dashboard metrics

#### Triggers Created:
- **`trg_start_review_referral_on_installed`** - Automatically starts sequence when lead moves to "installed" stage

### API Endpoints

1. **`GET /api/review-referral/dashboard`**
   - Returns review & referral dashboard metrics for the workspace
   - Shows: reviews this month, pending reviews, referral leads generated, jobs from referrals, avg review rating, etc.

2. **`POST /api/review-referral/process-due`**
   - Processes due review/referral sequence messages
   - Should be called by a cron job (e.g., every 15 minutes)
   - Requires `Authorization: Bearer ${CRON_SECRET}` header

3. **`POST /api/review-referral/check-negative-sentiment`**
   - Checks for negative sentiment in homeowner replies
   - Should be called when a reply is detected for a lead with an active sequence
   - Body: `{ lead_id, message_text, sentiment_score? }`

## The 3-Phase Post-Job Workflow

### Phase 1 — Review Collection Sequence
Triggered immediately after job completion.

**Message 1 (Same Day):**
- Subject: "Thank you for letting us take care of your roof!"
- Asks for review with link
- Sent immediately when job is installed

**Message 2 (48 Hours Later):**
- Subject: "Just checking in"
- Reminds about review, mentions helping neighbors in city
- Sent 48 hours after installation

**Message 3 (7 Days Later):**
- Subject: "Hope your roof is holding up great!"
- Final review request
- Sent 7 days after installation

### Phase 2 — Referral Generation Sequence
Sent AFTER review request sequence (usually Day 10).

**Message 1 — "Neighbor Check" (Day 10):**
- Subject: "Quick question about your neighbors"
- Asks about neighbors who might need roof work

**Message 2 — "Family & Friends" (Day 12):**
- Subject: "Quick question"
- Asks about family members dealing with leaks or storm damage

**Message 3 — "Reward Referral" (Day 14):**
- Subject: "Referral reward"
- Offers $100 thank-you card for referrals that book jobs

### Phase 3 — Long-Term Relationship Sequence
Creates YEARS of loyalty.

**1 Month:**
- Subject: "Hope everything still looks perfect"
- Check-in message

**6 Months:**
- Subject: "It's been a while"
- Offers to check for wear, wind lift, or damage

**12 Months (Anniversary):**
- Subject: "One year since your new roof!"
- Offers free inspection

## Setup Instructions

### 1. Run the Migration
```bash
# The migration file is already created:
# supabase/migrations/20250204000000_block_24540_review_referral_engine_v1.sql
```

### 2. Set Up Review Links
Roofers need to add their review links to the `review_links` table:

```sql
INSERT INTO review_links (workspace_id, link_type, review_url, is_primary, is_active)
VALUES (
  'your-workspace-id',
  'google',
  'https://g.page/r/YOUR_GOOGLE_REVIEW_LINK',
  true,
  true
);
```

### 3. Set Up Cron Job
Add a cron job to call `/api/review-referral/process-due` every 15 minutes:

```bash
# Example using cron
*/15 * * * * curl -X POST https://your-domain.com/api/review-referral/process-due \
  -H "Authorization: Bearer ${CRON_SECRET}"
```

Or use Vercel Cron Jobs, GitHub Actions, or any cron service.

### 4. Integrate Negative Sentiment Detection
When processing replies, call the negative sentiment check:

```typescript
// In your reply detection code
const response = await fetch('/api/review-referral/check-negative-sentiment', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    lead_id: leadId,
    message_text: replyText,
    sentiment_score: aiSentimentScore, // optional
  }),
});

const { is_negative } = await response.json();
if (is_negative) {
  // Sequence has been cancelled automatically
  // Roofer should be notified to respond personally
}
```

## Dashboard Integration

Add the review/referral dashboard panel to your roofer dashboard:

```typescript
// Fetch dashboard data
const response = await fetch('/api/review-referral/dashboard');
const { data } = await response.json();

// Display metrics:
// - Reviews This Month: data.reviews_this_month
// - Pending Reviews: data.pending_reviews
// - Referral Leads Generated: data.referral_leads_generated
// - Jobs from Referrals: data.jobs_from_referrals
// - Avg Review Rating: data.avg_review_rating
```

## How It Works

1. **Automatic Trigger**: When a lead moves to "installed" stage, the trigger `trg_start_review_referral_on_installed` automatically calls `start_review_referral_sequence()`.

2. **Message Scheduling**: The function schedules all 9 messages (3 per phase) with appropriate delays.

3. **Message Processing**: The cron job calls `/api/review-referral/process-due` every 15 minutes to:
   - Find all due messages
   - Check if sequences are still active
   - Check if leads are unsubscribed
   - Personalize message content
   - Send emails
   - Update sequence status
   - Move to next phase when appropriate

4. **Negative Sentiment Detection**: When a homeowner replies, call `/api/review-referral/check-negative-sentiment` to:
   - Detect negative keywords/phrases
   - Cancel the sequence if negative
   - Log the negative sentiment
   - Cancel all pending messages

5. **Review Tracking**: When a review is left (manually entered or via API), insert into `reviews_tracked` table.

6. **Referral Tracking**: When a referral is generated, insert into `referrals_tracked` table. Link to new lead when referral converts.

## Benefits

- **More Reviews** → Higher Google ranking → More inbound calls → More money
- **More Referrals** → Highest-profit leads → Automated generation
- **Long-Term Relationships** → Repeat business → Lifetime customers
- **Automated** → Roofers never forget to ask → Consistent execution

## Future Enhancements

- Photo + Social Automation (Instagram/Facebook/TikTok posts)
- AI-powered sentiment analysis integration
- Review link rotation
- Referral reward automation
- Google Map Rank tracking
- Review response automation






































