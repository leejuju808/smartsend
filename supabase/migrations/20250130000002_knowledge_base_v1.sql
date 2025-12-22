-- Block 23840 — SmartSend Roofing Knowledge Base v1
-- Comprehensive knowledge base system for reducing support load and increasing retention

-- ============================================================================
-- KNOWLEDGE BASE ARTICLES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS kb_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL, -- 'getting-started', 'templates', 'troubleshooting', 'playbooks', 'videos', 'billing'
  section TEXT, -- Sub-section within category (e.g., 'lead-revival' under templates)
  summary TEXT NOT NULL, -- 10-second answer snippet
  content TEXT NOT NULL, -- Full article content (markdown)
  video_url TEXT, -- Optional video URL
  video_duration INTEGER, -- Duration in seconds
  screenshot_urls TEXT[], -- Array of screenshot URLs
  related_article_ids UUID[], -- Related articles
  search_keywords TEXT[], -- Keywords for search optimization
  roofer_phrases TEXT[], -- Common roofer queries that match this article
  view_count INTEGER DEFAULT 0,
  helpful_count INTEGER DEFAULT 0,
  not_helpful_count INTEGER DEFAULT 0,
  order_index INTEGER DEFAULT 0, -- For ordering within category
  is_published BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_articles_category ON kb_articles(category);
CREATE INDEX IF NOT EXISTS idx_kb_articles_slug ON kb_articles(slug);
CREATE INDEX IF NOT EXISTS idx_kb_articles_published ON kb_articles(is_published) WHERE is_published = TRUE;
CREATE INDEX IF NOT EXISTS idx_kb_articles_search_keywords ON kb_articles USING GIN(search_keywords);
CREATE INDEX IF NOT EXISTS idx_kb_articles_roofer_phrases ON kb_articles USING GIN(roofer_phrases);

-- ============================================================================
-- KNOWLEDGE BASE CATEGORIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS kb_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT, -- Icon name/emoji
  order_index INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_categories_slug ON kb_categories(slug);
CREATE INDEX IF NOT EXISTS idx_kb_categories_active ON kb_categories(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- CONTEXTUAL HELP TRIGGERS TABLE
-- ============================================================================
-- Automatically show relevant KB articles based on user actions

CREATE TABLE IF NOT EXISTS kb_contextual_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type TEXT NOT NULL, -- 'first_campaign', 'low_open_rate', 'first_reply', 'campaign_paused', 'plan_change'
  trigger_conditions JSONB DEFAULT '{}'::jsonb, -- Additional conditions (e.g., {"open_rate": "<", "20"})
  article_id UUID NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  priority INTEGER DEFAULT 0, -- Higher priority shown first
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_contextual_triggers_type ON kb_contextual_triggers(trigger_type);
CREATE INDEX IF NOT EXISTS idx_kb_contextual_triggers_active ON kb_contextual_triggers(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- USER KB INTERACTIONS TABLE
-- ============================================================================
-- Track which articles users have viewed, found helpful, etc.

CREATE TABLE IF NOT EXISTS kb_user_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL, -- 'viewed', 'helpful', 'not_helpful', 'searched'
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional context (search query, time spent, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_user_interactions_user_id ON kb_user_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_kb_user_interactions_article_id ON kb_user_interactions(article_id);
CREATE INDEX IF NOT EXISTS idx_kb_user_interactions_type ON kb_user_interactions(interaction_type);

-- ============================================================================
-- SEARCH QUERY LOG TABLE
-- ============================================================================
-- Track search queries to improve search optimization

CREATE TABLE IF NOT EXISTS kb_search_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  results_count INTEGER DEFAULT 0,
  clicked_article_id UUID REFERENCES kb_articles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_search_queries_query ON kb_search_queries(query);
CREATE INDEX IF NOT EXISTS idx_kb_search_queries_created_at ON kb_search_queries(created_at DESC);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to search KB articles (optimized for roofer phrases)
CREATE OR REPLACE FUNCTION search_kb_articles(search_query TEXT)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  title TEXT,
  category TEXT,
  summary TEXT,
  relevance_score REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.slug,
    a.title,
    a.category,
    a.summary,
    -- Calculate relevance score
    (
      -- Exact title match (highest weight)
      CASE WHEN LOWER(a.title) LIKE '%' || LOWER(search_query) || '%' THEN 10 ELSE 0 END +
      -- Slug match
      CASE WHEN LOWER(a.slug) LIKE '%' || LOWER(search_query) || '%' THEN 8 ELSE 0 END +
      -- Content match
      CASE WHEN LOWER(a.content) LIKE '%' || LOWER(search_query) || '%' THEN 3 ELSE 0 END +
      -- Summary match
      CASE WHEN LOWER(a.summary) LIKE '%' || LOWER(search_query) || '%' THEN 5 ELSE 0 END +
      -- Keyword match
      CASE WHEN search_query = ANY(a.search_keywords) THEN 7 ELSE 0 END +
      -- Roofer phrase match (highest weight for exact match)
      CASE WHEN LOWER(search_query) = ANY(SELECT LOWER(unnest(a.roofer_phrases))) THEN 9 ELSE 0 END +
      -- Partial roofer phrase match
      CASE WHEN EXISTS (
        SELECT 1 FROM unnest(a.roofer_phrases) AS phrase 
        WHERE LOWER(phrase) LIKE '%' || LOWER(search_query) || '%'
      ) THEN 6 ELSE 0 END
    )::REAL AS relevance_score
  FROM kb_articles a
  WHERE a.is_published = TRUE
    AND (
      LOWER(a.title) LIKE '%' || LOWER(search_query) || '%'
      OR LOWER(a.content) LIKE '%' || LOWER(search_query) || '%'
      OR LOWER(a.summary) LIKE '%' || LOWER(search_query) || '%'
      OR search_query = ANY(a.search_keywords)
      OR EXISTS (
        SELECT 1 FROM unnest(a.roofer_phrases) AS phrase 
        WHERE LOWER(phrase) LIKE '%' || LOWER(search_query) || '%'
      )
    )
  ORDER BY relevance_score DESC, a.view_count DESC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql;

-- Function to get contextual help articles
CREATE OR REPLACE FUNCTION get_contextual_help(trigger_type_param TEXT, user_context JSONB DEFAULT '{}'::jsonb)
RETURNS TABLE (
  article_id UUID,
  article_title TEXT,
  article_summary TEXT,
  article_slug TEXT,
  priority INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.title,
    a.summary,
    a.slug,
    t.priority
  FROM kb_contextual_triggers t
  JOIN kb_articles a ON a.id = t.article_id
  WHERE t.trigger_type = trigger_type_param
    AND t.is_active = TRUE
    AND a.is_published = TRUE
  ORDER BY t.priority DESC, a.view_count DESC
  LIMIT 3;
END;
$$ LANGUAGE plpgsql;

-- Function to record article view
CREATE OR REPLACE FUNCTION record_kb_view(article_id_param UUID, user_id_param UUID)
RETURNS void AS $$
BEGIN
  -- Increment view count
  UPDATE kb_articles 
  SET view_count = view_count + 1
  WHERE id = article_id_param;
  
  -- Record user interaction
  INSERT INTO kb_user_interactions (user_id, article_id, interaction_type)
  VALUES (user_id_param, article_id_param, 'viewed')
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE kb_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_contextual_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_user_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_search_queries ENABLE ROW LEVEL SECURITY;

-- Everyone can read published articles
CREATE POLICY "Anyone can read published articles" ON kb_articles
  FOR SELECT USING (is_published = TRUE);

-- Authenticated users can read all articles
CREATE POLICY "Authenticated users can read all articles" ON kb_articles
  FOR SELECT TO authenticated USING (true);

-- Everyone can read categories
CREATE POLICY "Anyone can read categories" ON kb_categories
  FOR SELECT USING (is_active = TRUE);

-- Everyone can read contextual triggers
CREATE POLICY "Anyone can read contextual triggers" ON kb_contextual_triggers
  FOR SELECT USING (is_active = TRUE);

-- Users can create their own interactions
CREATE POLICY "Users can create their own interactions" ON kb_user_interactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Users can read their own interactions
CREATE POLICY "Users can read their own interactions" ON kb_user_interactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Users can create search queries
CREATE POLICY "Users can create search queries" ON kb_search_queries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- ============================================================================
-- SEED DATA: CATEGORIES
-- ============================================================================

INSERT INTO kb_categories (slug, title, description, icon, order_index) VALUES
  ('getting-started', 'Getting Started', 'Launch in 5 minutes', '🚀', 1),
  ('templates', 'Campaign Templates', 'Pre-built campaigns for every roofing scenario', '📧', 2),
  ('troubleshooting', 'Troubleshooting & Fixes', 'Quick fixes for common issues', '🔧', 3),
  ('playbooks', 'SmartSend Playbooks', 'High-level strategy and automation guides', '📚', 4),
  ('videos', 'Video Library', '60-120 second video guides', '🎥', 5),
  ('billing', 'Billing & Account', 'Manage your subscription and account', '💳', 6)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- SEED DATA: GETTING STARTED ARTICLES
-- ============================================================================

INSERT INTO kb_articles (slug, title, category, summary, content, search_keywords, roofer_phrases, order_index) VALUES
  (
    'create-first-campaign',
    'Create Your First Campaign',
    'getting-started',
    'Launch your first campaign in under 5 minutes. Import your list, choose a template, and start sending.',
    '# Create Your First Campaign

## Quick Start (5 Minutes)

1. **Go to Campaigns** → Click "New Campaign"
2. **Import Your List** → Upload CSV or connect your CRM
3. **Choose a Template** → Pick from pre-built roofing templates
4. **Review & Send** → SmartSend handles the rest

## Step-by-Step Guide

### Step 1: Import Your List

- Upload a CSV with homeowner names and emails
- Or connect your CRM (HubSpot, JobNimbus, etc.)
- SmartSend automatically validates emails

### Step 2: Choose Your Template

Templates are pre-built for roofing scenarios:
- **Lead Revival** — Re-engage past leads
- **Storm Damage** — Reach out after storms
- **Free Inspection** — Offer free roof inspections
- **Repair Follow-Up** — Follow up on repair quotes

### Step 3: Customize (Optional)

- Add your company name
- Adjust sending schedule
- Review message preview

### Step 4: Launch

Click "Start Campaign" and SmartSend begins sending automatically.

## What Happens Next?

- Emails send on your schedule
- Replies appear in your Inbox
- AI classifies leads (Hot/Warm/Cold)
- You take action on hot leads

## Need Help?

- See [How to Import Your List](./import-your-list)
- See [Understanding Your Dashboard](./understand-dashboard)
- See [Campaign Templates](./templates)
',
    ARRAY['campaign', 'create', 'first', 'launch', 'start', 'new'],
    ARRAY['how do I create a campaign', 'how to start a campaign', 'create my first campaign', 'launch campaign'],
    1
  ),
  (
    'import-your-list',
    'Import Your List',
    'getting-started',
    'Upload a CSV file or connect your CRM to import homeowner contacts into SmartSend.',
    '# Import Your List

## Two Ways to Import

### Option 1: CSV Upload (Fastest)

1. **Prepare Your CSV**
   - Required columns: `email`, `first_name`
   - Optional columns: `last_name`, `phone`, `address`, `city`, `state`, `zip`
   - Save as CSV file

2. **Upload**
   - Go to **Lists** → Click "Import"
   - Drag and drop your CSV file
   - SmartSend validates emails automatically

3. **Review**
   - Check for duplicates
   - Remove invalid emails
   - Confirm import

### Option 2: CRM Connection

Connect your CRM to sync contacts automatically:
- **HubSpot** — Full sync
- **JobNimbus** — Lead sync
- **Salesforce** — Contact sync

## CSV Format Example

```csv
email,first_name,last_name,phone,address,city,state,zip
john@example.com,John,Smith,555-1234,123 Main St,Denver,CO,80202
jane@example.com,Jane,Doe,555-5678,456 Oak Ave,Denver,CO,80203
```

## What Happens After Import?

- Contacts are validated
- Duplicates are removed
- Bad emails are filtered
- List is ready for campaigns

## Troubleshooting

**"Invalid email format"** → Check your CSV has proper email addresses
**"Duplicate found"** → SmartSend automatically removes duplicates
**"Import failed"** → Check file size (max 10MB) and format
',
    ARRAY['import', 'list', 'csv', 'upload', 'contacts', 'crm'],
    ARRAY['how do I import my list', 'upload contacts', 'add people', 'import csv', 'how to add contacts'],
    2
  ),
  (
    'understand-dashboard',
    'How to Understand Your Dashboard',
    'getting-started',
    'Your dashboard shows campaign performance, reply rates, and revenue metrics at a glance.',
    '# Understanding Your Dashboard

## Dashboard Overview

Your SmartSend dashboard shows everything you need to know about your campaigns and leads.

## Key Metrics

### Campaign Performance
- **Sent** — Total emails sent
- **Opened** — Open rate percentage
- **Replied** — Reply rate percentage
- **Hot Leads** — Number of hot leads generated

### Revenue Metrics
- **Estimated Revenue** — Value of booked jobs
- **Pipeline Value** — Total value of active leads
- **Jobs Booked** — Number of jobs closed

### Activity Feed
- Recent replies
- Campaign updates
- Lead status changes

## What Each Section Means

### Campaigns Card
Shows your active campaigns:
- Campaign name
- Status (Active/Paused)
- Performance metrics
- Quick actions

### Inbox Card
Shows recent replies:
- Hot leads (priority)
- Warm leads
- Follow-up needed

### Revenue Card
Shows revenue tracking:
- Booked jobs
- Pipeline value
- Estimated revenue

## Quick Actions

- **New Campaign** → Launch a new campaign
- **View Inbox** → See all replies
- **View Pipeline** → Manage leads

## Tips

- Check dashboard daily for hot leads
- Monitor open rates (aim for 20%+)
- Track reply rates (aim for 5%+)
',
    ARRAY['dashboard', 'metrics', 'performance', 'analytics', 'stats'],
    ARRAY['what does my dashboard mean', 'how to read dashboard', 'understanding metrics', 'what are these numbers'],
    3
  ),
  (
    'what-replies-mean',
    'What Replies Mean and How to Respond',
    'getting-started',
    'SmartSend classifies every reply as Hot, Warm, Follow-Up, or Not Interested. Here''s how to respond to each.',
    '# What Replies Mean and How to Respond

## Reply Classification

SmartSend automatically classifies every homeowner reply into 4 categories:

### 🔥 Hot Lead (80-100 score)
**What it means:** Homeowner wants an estimate, appointment, or immediate repair.

**How to respond:**
1. **Call immediately** — Use "Call Now" button
2. **Book estimate** — Use "Mark as Booked" button
3. **Send estimate link** — If they requested pricing

**Example replies:**
- "Yes, I need a quote"
- "When can you come out?"
- "My roof is leaking"

### 🔶 Warm Lead (60-79 score)
**What it means:** Interested but not urgent. Pricing questions, considering options.

**How to respond:**
1. **Send estimate** — Provide pricing information
2. **Schedule follow-up** — Set reminder for next week
3. **Answer questions** — Address their concerns

**Example replies:**
- "How much does it cost?"
- "I''m considering it"
- "Tell me more"

### 📋 Follow-Up Needed (40-59 score)
**What it means:** Unclear intent or questions that need manual response.

**How to respond:**
1. **Read the reply** — Understand what they''re asking
2. **Respond manually** — Use AI Reply Assistant or write your own
3. **Clarify** — Ask follow-up questions if needed

**Example replies:**
- "What''s your warranty?"
- "Do you work in my area?"
- "I have questions"

### ❌ Not Interested (0-39 score)
**What it means:** Declined, unsubscribed, or spam.

**How to respond:**
- **Nothing** — SmartSend automatically stops sending
- **Respect their choice** — Don''t follow up

**Example replies:**
- "Not interested"
- "Remove me"
- "Stop emailing"

## Lead Scores Explained

Every reply gets a score from 0-100:
- **80-100:** HOT — Book estimate NOW
- **60-79:** WARM — Follow up this week
- **40-59:** COLD — Low priority
- **0-39:** Not interested or spam

## Response Actions

### Call Now
- One-click calling
- Opens your phone dialer
- Call immediately for hot leads

### Mark as Booked
- Marks lead as booked
- Adds to your calendar
- Tracks revenue

### Send Estimate
- Generates estimate link
- Sends via email
- Tracks opens/clicks

### Reply
- Use AI Reply Assistant
- Or write your own response
- SmartSend sends automatically

## Best Practices

1. **Respond to hot leads within 1 hour**
2. **Follow up on warm leads within 24 hours**
3. **Don''t ignore follow-up needed** — These can convert
4. **Respect not interested** — Don''t spam

## Need Help?

- See [Inbox Actions Guide](./inbox-actions)
- See [Lead Scores Explained](./lead-scores)
',
    ARRAY['replies', 'respond', 'hot lead', 'warm lead', 'classification', 'lead score'],
    ARRAY['what do replies mean', 'how to respond', 'what is a hot lead', 'why are no one replying', 'how do I respond'],
    4
  ),
  (
    'connect-email',
    'How to Connect Your Email',
    'getting-started',
    'Connect your email to SmartSend so replies appear in your Inbox automatically.',
    '# How to Connect Your Email

## Why Connect Your Email?

When you connect your email, SmartSend can:
- **Receive replies** — All homeowner replies appear in your Inbox
- **Send from your domain** — Emails come from your business email
- **Track opens/clicks** — See who opened and clicked

## Setup Steps

### Step 1: Go to Settings
1. Click **Settings** in sidebar
2. Go to **Email** section
3. Click "Connect Email"

### Step 2: Choose Your Provider

**Gmail / Google Workspace:**
1. Click "Connect Gmail"
2. Sign in with Google
3. Authorize SmartSend
4. Done!

**Outlook / Microsoft 365:**
1. Click "Connect Outlook"
2. Sign in with Microsoft
3. Authorize SmartSend
4. Done!

**Custom Domain:**
1. Enter your domain
2. Add DNS records (we''ll show you how)
3. Verify domain
4. Done!

### Step 3: Verify Connection

- Check "Connected" status in Settings
- Send a test email
- Check your Inbox for replies

## DNS Setup (Custom Domain)

If using a custom domain, add these DNS records:

**SPF Record:**
```
TXT @ "v=spf1 include:smartsend.ai ~all"
```

**DKIM Record:**
```
TXT smartsend._domainkey "your-dkim-key"
```

**DMARC Record (Optional):**
```
TXT _dmarc "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com"
```

## Troubleshooting

**"Connection failed"**
- Check your email/password
- Make sure 2FA is disabled (or use app password)
- Try reconnecting

**"DNS not verified"**
- Wait 24-48 hours for DNS propagation
- Check DNS records are correct
- Contact support if still not working

**"Replies not appearing"**
- Check email is connected
- Verify DNS records
- Check spam folder

## Best Practices

- Use a dedicated email for SmartSend
- Set up custom domain for better deliverability
- Monitor DNS records monthly
',
    ARRAY['email', 'connect', 'gmail', 'outlook', 'dns', 'domain', 'setup'],
    ARRAY['how do I connect my email', 'setup email', 'connect gmail', 'how to connect outlook'],
    5
  )
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- SEED DATA: TEMPLATES ARTICLES
-- ============================================================================

INSERT INTO kb_articles (slug, title, category, section, summary, content, search_keywords, roofer_phrases, order_index) VALUES
  (
    'template-lead-revival',
    'Lead Revival Template',
    'templates',
    'lead-revival',
    'Re-engage past leads who didn''t respond. Perfect for following up on old quotes or estimates.',
    '# Lead Revival Template

## When to Use

- Following up on old quotes (30+ days)
- Re-engaging leads who went cold
- Checking in on past estimates
- Reconnecting with previous contacts

## Who It Targets

- Homeowners who requested quotes but didn''t book
- Past customers who might need repairs
- Leads from 3-6 months ago

## Expected Results

- **Open Rate:** 25-35%
- **Reply Rate:** 3-5%
- **Booking Rate:** 1-2% of sent

## Message Preview

**Subject:** Quick check-in on your roof

**Body:**
Hey {{first_name}},

I wanted to circle back — we quoted your roof a few months ago and I wanted to see if you still needed help.

If timing is better now, I can get you a fresh estimate. No pressure, just wanted to check in.

Let me know if you''re still interested.

– {{sender_name}}

## Follow-Up Sequence

1. **Day 0:** Initial email
2. **Day 3:** Soft reminder (if no reply)
3. **Day 7:** Final check-in (if no reply)

## Recommended Sending Schedule

- **Best days:** Tuesday-Thursday
- **Best time:** 9-11 AM or 2-4 PM
- **Frequency:** Once per quarter (every 3 months)

## How This Helps Roofers

This template turns cold leads into warm opportunities. Many homeowners delay roof work, so a simple check-in can re-ignite interest and generate bookings.
',
    ARRAY['lead revival', 'follow up', 'old leads', 're-engage', 'cold leads'],
    ARRAY['how to follow up on old leads', 're-engage past customers', 'follow up on quotes', 'lead revival'],
    1
  ),
  (
    'template-free-inspection',
    'Free Inspection Template',
    'templates',
    'free-inspection',
    'Offer free roof inspections to generate leads. Perfect for building your pipeline.',
    '# Free Inspection Template

## When to Use

- Building your lead pipeline
- After storms or weather events
- Seasonal outreach (spring/fall)
- New market entry

## Who It Targets

- Homeowners in your service area
- Properties with older roofs (15+ years)
- Areas hit by recent storms
- Neighborhoods you want to target

## Expected Results

- **Open Rate:** 30-40%
- **Reply Rate:** 5-8%
- **Booking Rate:** 2-3% of sent

## Message Preview

**Subject:** Free roof inspection in {{city}}

**Body:**
Hey {{first_name}},

I''m offering free roof inspections in {{city}} this week — no obligation, just want to help homeowners understand their roof condition.

I can swing by tomorrow or Thursday if that works. Takes about 10-15 minutes.

Let me know if you''re interested.

– {{sender_name}}

## Follow-Up Sequence

1. **Day 0:** Initial offer
2. **Day 2:** Reminder (if no reply)
3. **Day 5:** Final offer (if no reply)

## Recommended Sending Schedule

- **Best days:** Monday-Wednesday
- **Best time:** 8-10 AM
- **Frequency:** Weekly or bi-weekly

## How This Helps Roofers

Free inspections are the #1 way to generate booked estimates. Homeowners love "free" and inspections lead to repairs and replacements.
',
    ARRAY['free inspection', 'inspection', 'lead generation', 'offer'],
    ARRAY['free inspection template', 'how to get inspections', 'offer free inspection'],
    2
  ),
  (
    'template-storm-damage',
    'Storm Damage Template',
    'templates',
    'storm-damage',
    'Reach out immediately after storms to homeowners who may have roof damage.',
    '# Storm Damage Template

## When to Use

- Immediately after storms (within 24-48 hours)
- After hail, wind, or heavy rain
- When weather alerts hit your area
- During storm season

## Who It Targets

- Homeowners in storm-affected areas
- Properties with visible damage potential
- Areas hit by severe weather
- Insurance claim opportunities

## Expected Results

- **Open Rate:** 40-50% (high urgency)
- **Reply Rate:** 8-12%
- **Booking Rate:** 3-5% of sent

## Message Preview

**Subject:** Quick roof check after {{storm_type}}?

**Body:**
Hey {{first_name}},

I saw {{city}} got hit with {{storm_type}} yesterday — wanted to check if your roof is okay.

I can do a quick inspection today or tomorrow to see if there''s any damage. Insurance usually covers storm damage, so it''s worth checking.

Let me know if you want me to take a look.

– {{sender_name}}

## Follow-Up Sequence

1. **Day 0:** Immediate outreach
2. **Day 1:** Urgent follow-up (if no reply)
3. **Day 3:** Final check-in (if no reply)

## Recommended Sending Schedule

- **Best time:** Within 24 hours of storm
- **Send immediately** when weather hits
- **Frequency:** Per storm event

## How This Helps Roofers

Storm damage is high-value work. Homeowners are motivated and insurance often covers repairs. This template helps you capture storm work fast.
',
    ARRAY['storm', 'damage', 'hail', 'wind', 'insurance', 'claim'],
    ARRAY['storm damage template', 'after storm outreach', 'storm script', 'hail damage'],
    3
  ),
  (
    'template-repair-followup',
    'Repair Follow-Up Template',
    'templates',
    'repair-followup',
    'Follow up on repair quotes to convert estimates into booked jobs.',
    '# Repair Follow-Up Template

## When to Use

- After sending repair quotes
- Following up on small repair estimates
- Converting repair leads to booked work
- Re-engaging repair-only inquiries

## Who It Targets

- Homeowners who requested repair quotes
- Leads with minor roof issues
- Properties needing spot repairs
- Homeowners considering repairs

## Expected Results

- **Open Rate:** 35-45%
- **Reply Rate:** 6-10%
- **Booking Rate:** 2-4% of sent

## Message Preview

**Subject:** Following up on your repair quote

**Body:**
Hey {{first_name}},

I wanted to check in on the repair quote I sent last week — are you still thinking about getting that fixed?

I can schedule it for this week if you''re ready. Let me know what works best.

– {{sender_name}}

## Follow-Up Sequence

1. **Day 0:** Initial follow-up (3-5 days after quote)
2. **Day 3:** Soft reminder
3. **Day 7:** Final check-in

## Recommended Sending Schedule

- **Best days:** Tuesday-Thursday
- **Best time:** 10 AM - 2 PM
- **Frequency:** 3-5 days after quote sent

## How This Helps Roofers

Repair follow-ups convert quotes into booked work. Many homeowners need a nudge to schedule repairs, and this template provides that.
',
    ARRAY['repair', 'follow up', 'quote', 'estimate', 'booking'],
    ARRAY['follow up on repair quote', 'repair follow up', 'convert repair leads'],
    4
  ),
  (
    'template-after-quote',
    'After-Quote Follow-Up Template',
    'templates',
    'after-quote',
    'Follow up after sending replacement quotes to close more jobs.',
    '# After-Quote Follow-Up Template

## When to Use

- After sending replacement roof quotes
- Following up on large estimates ($10K+)
- Converting quotes to booked jobs
- Addressing pricing objections

## Who It Targets

- Homeowners who received replacement quotes
- Leads considering full roof replacement
- Properties with significant roof issues
- Homeowners comparing quotes

## Expected Results

- **Open Rate:** 40-50%
- **Reply Rate:** 10-15%
- **Booking Rate:** 5-8% of sent

## Message Preview

**Subject:** Questions about your roof quote?

**Body:**
Hey {{first_name}},

I wanted to check if you had any questions about the quote I sent for your roof replacement.

I know it''s a big decision, so I''m here to answer anything. We can also talk about financing options if that helps.

Let me know if you want to discuss.

– {{sender_name}}

## Follow-Up Sequence

1. **Day 0:** Initial follow-up (2-3 days after quote)
2. **Day 4:** Address common objections
3. **Day 7:** Final check-in with urgency

## Recommended Sending Schedule

- **Best days:** Tuesday-Thursday
- **Best time:** 9-11 AM or 2-4 PM
- **Frequency:** 2-3 days after quote sent

## How This Helps Roofers

After-quote follow-ups are critical for closing jobs. Most homeowners need multiple touches before booking, and this template provides that.
',
    ARRAY['quote', 'follow up', 'replacement', 'estimate', 'close'],
    ARRAY['what should I send after a quote', 'follow up after quote', 'convert quote to booking'],
    5
  ),
  (
    'template-seasonal-winter',
    'Seasonal Template: Winter Leaks',
    'templates',
    'seasonal',
    'Target homeowners with winter leak issues during cold months.',
    '# Seasonal Template: Winter Leaks

## When to Use

- During winter months (November-March)
- After heavy snow or ice
- When temperatures drop
- Targeting leak-prone areas

## Who It Targets

- Homeowners in cold climates
- Properties with known leak issues
- Areas with heavy winter weather
- Homeowners experiencing leaks

## Expected Results

- **Open Rate:** 35-45%
- **Reply Rate:** 6-10%
- **Booking Rate:** 2-4% of sent

## Message Preview

**Subject:** Winter roof leaks?

**Body:**
Hey {{first_name}},

Winter weather can cause roof leaks — ice dams, snow buildup, and temperature changes can all lead to problems.

If you''re seeing any leaks or water damage, I can take a look. I''m doing emergency repairs this week.

Let me know if you need help.

– {{sender_name}}

## Follow-Up Sequence

1. **Day 0:** Initial outreach
2. **Day 2:** Urgent reminder
3. **Day 5:** Final check-in

## Recommended Sending Schedule

- **Best days:** Monday-Wednesday
- **Best time:** 8-10 AM
- **Frequency:** Weekly during winter

## How This Helps Roofers

Winter leaks are urgent and high-value. Homeowners need immediate help, and this template helps you capture that work.
',
    ARRAY['winter', 'leaks', 'seasonal', 'snow', 'ice', 'emergency'],
    ARRAY['winter leaks template', 'seasonal campaign', 'winter roofing'],
    6
  ),
  (
    'template-review-request',
    'Review Request Template',
    'templates',
    'review-request',
    'Ask satisfied customers for reviews to build social proof and generate referrals.',
    '# Review Request Template

## When to Use

- After completing jobs
- Following up with satisfied customers
- Building online reputation
- Generating social proof

## Who It Targets

- Recent customers (within 30 days)
- Homeowners who expressed satisfaction
- Completed job customers
- Happy past clients

## Expected Results

- **Open Rate:** 50-60% (high engagement)
- **Reply Rate:** 15-25%
- **Review Rate:** 10-15% of sent

## Message Preview

**Subject:** Quick favor?

**Body:**
Hey {{first_name}},

Hope you''re happy with the roof work we did! If you have a minute, I''d love a quick review on Google or Facebook.

It really helps other homeowners find us. Here''s the link: {{review_link}}

Thanks so much!

– {{sender_name}}

## Follow-Up Sequence

1. **Day 0:** Initial request
2. **Day 3:** Gentle reminder (if no review)
3. **Day 7:** Final ask (if no review)

## Recommended Sending Schedule

- **Best days:** Tuesday-Thursday
- **Best time:** 10 AM - 2 PM
- **Frequency:** 7-14 days after job completion

## How This Helps Roofers

Reviews build trust and generate referrals. This template helps you collect reviews systematically, which leads to more bookings.
',
    ARRAY['review', 'testimonial', 'referral', 'social proof'],
    ARRAY['how to get reviews', 'review request', 'ask for reviews'],
    7
  ),
  (
    'template-referral-request',
    'Referral Request Template',
    'templates',
    'referral-request',
    'Ask happy customers for referrals to generate new leads from your best source.',
    '# Referral Request Template

## When to Use

- After completing jobs
- Following up with very satisfied customers
- Building referral pipeline
- Generating word-of-mouth leads

## Who It Targets

- Recent customers (within 60 days)
- Homeowners who expressed high satisfaction
- Customers who gave referrals before
- Your best past clients

## Expected Results

- **Open Rate:** 45-55%
- **Reply Rate:** 10-15%
- **Referral Rate:** 5-8% of sent

## Message Preview

**Subject:** Know anyone who needs roof work?

**Body:**
Hey {{first_name}},

Hope you''re still happy with your roof! I''m looking to help a few more homeowners in {{city}}.

If you know anyone who might need roof work, I''d love an introduction. I''ll take great care of them just like I did for you.

Thanks!

– {{sender_name}}

## Follow-Up Sequence

1. **Day 0:** Initial request
2. **Day 5:** Gentle reminder
3. **Day 14:** Final ask

## Recommended Sending Schedule

- **Best days:** Tuesday-Thursday
- **Best time:** 10 AM - 2 PM
- **Frequency:** Monthly to best customers

## How This Helps Roofers

Referrals are your highest-quality leads. This template helps you systematically ask for referrals, which generates the best bookings.
',
    ARRAY['referral', 'word of mouth', 'introduction', 'recommendation'],
    ARRAY['how to get referrals', 'referral request', 'ask for referrals'],
    8
  )
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- SEED DATA: TROUBLESHOOTING ARTICLES
-- ============================================================================

INSERT INTO kb_articles (slug, title, category, summary, content, search_keywords, roofer_phrases, order_index) VALUES
  (
    'low-open-rate',
    'Low Open Rate: How to Fix It',
    'troubleshooting',
    'Your open rate is low because your list is old or your subject line is too generic. Fix: clean list + storm-specific subject line.',
    '# Low Open Rate: How to Fix It

## 10-Second Answer

Your list is old or your subject line is too generic. Fix: clean list + storm-specific subject line.

## What Causes Low Open Rates

1. **Old email list** — Emails are outdated or invalid
2. **Generic subject lines** — Not relevant to homeowners
3. **Poor timing** — Sending at wrong times
4. **Spam folder** — Emails going to spam
5. **Wrong audience** — Targeting wrong homeowners

## 2-Minute Fix

### Step 1: Clean Your List
1. Go to **Lists** → Select your list
2. Click "Clean List"
3. Remove invalid emails
4. Remove duplicates

### Step 2: Improve Subject Lines
- Use storm-specific: "Quick roof check after {{storm}}?"
- Use local: "Free inspection in {{city}}"
- Use urgent: "Roof leak? I can help today"
- Avoid generic: "Hello" or "Check this out"

### Step 3: Check Timing
- **Best days:** Tuesday-Thursday
- **Best times:** 9-11 AM or 2-4 PM
- Avoid: Monday mornings, Friday afternoons

## Video Guide

[Watch: How to Fix Low Open Rates]({{video_url}})

## Expected Results

After fixing:
- **Open rate:** 20-30% (up from 5-10%)
- **More replies:** Better opens = more replies
- **Better ROI:** More engagement = more bookings

## How This Helps Roofers

Low open rates mean wasted sends. Fixing this means more homeowners see your messages, which leads to more replies and bookings.
',
    ARRAY['open rate', 'low opens', 'subject line', 'deliverability'],
    ARRAY['low open rate', 'why is my open rate low', 'how to fix open rate', 'no one opening emails'],
    1
  ),
  (
    'low-reply-rate',
    'Low Reply Rate: How to Fix It',
    'troubleshooting',
    'Your reply rate is low because your message isn''t relevant or your list isn''t qualified. Fix: use roofing-specific templates + target right homeowners.',
    '# Low Reply Rate: How to Fix It

## 10-Second Answer

Your message isn''t relevant or your list isn''t qualified. Fix: use roofing-specific templates + target right homeowners.

## What Causes Low Reply Rates

1. **Generic messages** — Not relevant to roofing
2. **Wrong audience** — Targeting homeowners who don''t need roofs
3. **Poor timing** — Sending at wrong times
4. **Too salesy** — Coming across as spam
5. **No clear CTA** — Homeowners don''t know what to do

## 2-Minute Fix

### Step 1: Use Roofing Templates
- Use **Storm Damage** template after storms
- Use **Free Inspection** for lead generation
- Use **Repair Follow-Up** for repair quotes
- Avoid generic templates

### Step 2: Target Right Homeowners
- Target properties 15+ years old
- Target storm-affected areas
- Target neighborhoods you serve
- Avoid random lists

### Step 3: Improve Your Message
- Be specific: "Quick roof check after {{storm}}?"
- Be helpful: "I can help with {{issue}}"
- Be local: "In {{city}}"
- Avoid: Generic sales pitches

## Video Guide

[Watch: How to Fix Low Reply Rates]({{video_url}})

## Expected Results

After fixing:
- **Reply rate:** 5-8% (up from 1-2%)
- **More hot leads:** Better replies = more bookings
- **Better ROI:** More engagement = more revenue

## How This Helps Roofers

Low reply rates mean wasted campaigns. Fixing this means more homeowners respond, which leads to more hot leads and bookings.
',
    ARRAY['reply rate', 'low replies', 'response rate', 'engagement'],
    ARRAY['low reply rate', 'why are no one replying', 'how to get more replies', 'no replies'],
    2
  ),
  (
    'no-replies-after-day-3',
    'No Replies After Day 3: What to Do',
    'troubleshooting',
    'If you''re not getting replies after day 3, your follow-up sequence might be too aggressive or your initial message didn''t resonate. Fix: adjust follow-up timing + improve initial message.',
    '# No Replies After Day 3: What to Do

## 10-Second Answer

Your follow-up sequence might be too aggressive or your initial message didn''t resonate. Fix: adjust follow-up timing + improve initial message.

## What Causes No Replies After Day 3

1. **Too aggressive follow-ups** — Sending too often
2. **Weak initial message** — Didn''t grab attention
3. **Wrong timing** — Sending at bad times
4. **List quality** — Emails aren''t engaged
5. **No value** — Message doesn''t help homeowners

## 2-Minute Fix

### Step 1: Adjust Follow-Up Timing
- **Day 0:** Initial email
- **Day 3:** First follow-up (not day 1)
- **Day 7:** Second follow-up (not day 3)
- **Day 14:** Final follow-up (not day 5)

### Step 2: Improve Initial Message
- Lead with value: "Free inspection"
- Be specific: "After {{storm}}"
- Be local: "In {{city}}"
- Have clear CTA: "Let me know if interested"

### Step 3: Check List Quality
- Remove unengaged emails
- Target active homeowners
- Focus on your service area

## Video Guide

[Watch: Follow-Up Sequence Best Practices]({{video_url}})

## Expected Results

After fixing:
- **More replies:** Better timing = more responses
- **Less unsubscribes:** Less aggressive = happier homeowners
- **Better ROI:** More engagement = more bookings

## How This Helps Roofers

No replies after day 3 means your campaign isn''t working. Fixing this means more homeowners respond throughout your sequence.
',
    ARRAY['follow up', 'no replies', 'sequence', 'timing'],
    ARRAY['no replies after day 3', 'follow up not working', 'why no replies'],
    3
  ),
  (
    'email-deliverability',
    'Email Deliverability: How to Improve It',
    'troubleshooting',
    'Your emails are going to spam because your domain isn''t verified or your sending reputation is poor. Fix: verify domain + warm up sending + use clean lists.',
    '# Email Deliverability: How to Improve It

## 10-Second Answer

Your emails are going to spam because your domain isn''t verified or your sending reputation is poor. Fix: verify domain + warm up sending + use clean lists.

## What Causes Poor Deliverability

1. **Unverified domain** — No SPF/DKIM records
2. **Poor sending reputation** — Too many bounces/spam complaints
3. **Dirty list** — Invalid emails, spam traps
4. **Too aggressive** — Sending too many emails too fast
5. **Spam triggers** — Words/phrases that trigger spam filters

## 2-Minute Fix

### Step 1: Verify Your Domain
1. Go to **Settings** → **Email**
2. Add SPF record: `v=spf1 include:smartsend.ai ~all`
3. Add DKIM record (provided by SmartSend)
4. Verify domain (takes 24-48 hours)

### Step 2: Clean Your List
1. Remove invalid emails
2. Remove spam traps
3. Remove unsubscribes
4. Remove bounces

### Step 3: Warm Up Sending
- Start with 50 emails/day
- Gradually increase to 500/day
- Monitor bounce rate (< 2%)
- Monitor spam complaints (< 0.1%)

## Video Guide

[Watch: Domain Verification Setup]({{video_url}})

## Expected Results

After fixing:
- **Better inbox placement:** 90%+ inbox rate
- **Higher open rates:** More emails seen = more opens
- **Better reputation:** Improved sender score

## How This Helps Roofers

Poor deliverability means wasted sends. Fixing this means more emails reach inboxes, which leads to more opens and replies.
',
    ARRAY['deliverability', 'spam', 'domain', 'verification', 'inbox'],
    ARRAY['emails going to spam', 'how to fix deliverability', 'improve email delivery', 'fix my email'],
    4
  ),
  (
    'clean-bad-list',
    'How to Clean a Bad List',
    'troubleshooting',
    'Your list has invalid emails, duplicates, or spam traps. Fix: use SmartSend list cleaning tool + remove bounces + remove unsubscribes.',
    '# How to Clean a Bad List

## 10-Second Answer

Your list has invalid emails, duplicates, or spam traps. Fix: use SmartSend list cleaning tool + remove bounces + remove unsubscribes.

## What Makes a List "Bad"

1. **Invalid emails** — Bounced, don''t exist
2. **Duplicates** — Same email multiple times
3. **Spam traps** — Emails that mark you as spam
4. **Unsubscribes** — People who opted out
5. **Dead emails** — Inactive, never open

## 2-Minute Fix

### Step 1: Use SmartSend List Cleaner
1. Go to **Lists** → Select your list
2. Click "Clean List"
3. SmartSend automatically:
   - Removes invalid emails
   - Removes duplicates
   - Removes bounces
   - Removes unsubscribes

### Step 2: Manual Review
1. Check "Invalid Emails" section
2. Review "Duplicates" section
3. Remove obvious spam traps
4. Confirm cleaning

### Step 3: Re-Import Clean List
1. Export cleaned list
2. Re-import to SmartSend
3. Start fresh campaign

## Video Guide

[Watch: List Cleaning Tutorial]({{video_url}})

## Expected Results

After cleaning:
- **Better deliverability:** Clean list = better inbox placement
- **Higher open rates:** Valid emails = more opens
- **Less bounces:** Clean list = fewer bounces

## How This Helps Roofers

Bad lists waste sends and hurt deliverability. Cleaning your list means more emails reach real homeowners, which leads to more replies.
',
    ARRAY['clean list', 'bad list', 'invalid emails', 'duplicates'],
    ARRAY['how to clean a bad list', 'remove invalid emails', 'clean my list'],
    5
  ),
  (
    'handle-spam-complaints',
    'How to Handle Spam Complaints',
    'troubleshooting',
    'Spam complaints hurt your sending reputation. Fix: remove complainers immediately + improve message relevance + add clear unsubscribe.',
    '# How to Handle Spam Complaints

## 10-Second Answer

Spam complaints hurt your sending reputation. Fix: remove complainers immediately + improve message relevance + add clear unsubscribe.

## What Causes Spam Complaints

1. **Irrelevant messages** — Not what homeowners want
2. **Too frequent** — Sending too often
3. **No unsubscribe** — Can''t opt out easily
4. **Wrong audience** — Targeting wrong homeowners
5. **Spammy content** — Looks like spam

## 2-Minute Fix

### Step 1: Remove Complainers Immediately
1. Go to **Settings** → **Suppressions**
2. Find spam complainers
3. Remove from all lists
4. Never email again

### Step 2: Improve Message Relevance
- Use roofing-specific templates
- Target right homeowners
- Be helpful, not salesy
- Add value in every message

### Step 3: Add Clear Unsubscribe
- Every email has unsubscribe link
- Make it easy to find
- Honor unsubscribes immediately
- Don''t email unsubscribed

## Video Guide

[Watch: Spam Complaint Prevention]({{video_url}})

## Expected Results

After fixing:
- **Lower complaint rate:** < 0.1% complaint rate
- **Better reputation:** Improved sender score
- **Better deliverability:** Less spam = better inbox

## How This Helps Roofers

Spam complaints destroy your sending reputation. Fixing this means better deliverability and more emails reaching inboxes.
',
    ARRAY['spam', 'complaints', 'reputation', 'unsubscribe'],
    ARRAY['how to handle spam complaints', 'spam complaints', 'reduce spam'],
    6
  ),
  (
    'change-sending-domain',
    'How to Change Your Sending Domain',
    'troubleshooting',
    'To change your sending domain, add new domain in Settings, verify DNS records, and update campaigns to use new domain.',
    '# How to Change Your Sending Domain

## 10-Second Answer

To change your sending domain, add new domain in Settings, verify DNS records, and update campaigns to use new domain.

## When to Change Domain

1. **New business email** — Switching to new domain
2. **Better deliverability** — Current domain has poor reputation
3. **Branding** — Want to use branded domain
4. **Compliance** — Need domain for compliance

## 2-Minute Fix

### Step 1: Add New Domain
1. Go to **Settings** → **Email** → **Domains**
2. Click "Add Domain"
3. Enter your domain (e.g., yourcompany.com)
4. Click "Add"

### Step 2: Verify DNS Records
1. Add SPF record: `v=spf1 include:smartsend.ai ~all`
2. Add DKIM record (provided by SmartSend)
3. Add DMARC record (optional but recommended)
4. Wait 24-48 hours for verification

### Step 3: Update Campaigns
1. Go to **Campaigns**
2. Select campaign
3. Change "From Domain" to new domain
4. Save campaign

## Video Guide

[Watch: Domain Setup Tutorial]({{video_url}})

## Expected Results

After changing:
- **Better branding:** Emails from your domain
- **Better deliverability:** Fresh domain = better reputation
- **More trust:** Homeowners trust your domain

## How This Helps Roofers

Changing your sending domain improves branding and deliverability. This means more emails reach inboxes and homeowners trust your messages more.
',
    ARRAY['domain', 'sending domain', 'change domain', 'dns'],
    ARRAY['how to change sending domain', 'change domain', 'setup new domain'],
    7
  ),
  (
    're-verify-dns',
    'How to Re-Verify Your DNS',
    'troubleshooting',
    'If DNS verification failed, check your DNS records are correct, wait 24-48 hours for propagation, then re-verify in Settings.',
    '# How to Re-Verify Your DNS

## 10-Second Answer

If DNS verification failed, check your DNS records are correct, wait 24-48 hours for propagation, then re-verify in Settings.

## When DNS Verification Fails

1. **Wrong records** — DNS records are incorrect
2. **Not propagated** — Records haven''t propagated yet
3. **Wrong domain** — Verifying wrong domain
4. **DNS issues** — DNS provider problems

## 2-Minute Fix

### Step 1: Check DNS Records
1. Go to your DNS provider (GoDaddy, Cloudflare, etc.)
2. Check SPF record: `v=spf1 include:smartsend.ai ~all`
3. Check DKIM record matches SmartSend
4. Verify records are correct

### Step 2: Wait for Propagation
- DNS changes take 24-48 hours
- Use DNS checker tool to verify
- Wait before re-verifying

### Step 3: Re-Verify in SmartSend
1. Go to **Settings** → **Email** → **Domains**
2. Click "Re-Verify" on your domain
3. SmartSend checks DNS records
4. If verified, you''re done!

## Video Guide

[Watch: DNS Verification Troubleshooting]({{video_url}})

## Expected Results

After re-verifying:
- **Domain verified:** DNS records confirmed
- **Better deliverability:** Verified domain = better inbox
- **Can send emails:** Domain ready to use

## How This Helps Roofers

DNS verification is required for sending. Re-verifying ensures your domain is set up correctly, which means better deliverability.
',
    ARRAY['dns', 'verify', 'verification', 'domain'],
    ARRAY['how to re-verify dns', 'dns verification failed', 're-verify domain'],
    8
  ),
  (
    'fix-broken-sequence',
    'How to Fix a Broken Sequence',
    'troubleshooting',
    'If your follow-up sequence isn''t sending, check campaign is active, sequence steps are configured, and sending schedule is correct.',
    '# How to Fix a Broken Sequence

## 10-Second Answer

If your follow-up sequence isn''t sending, check campaign is active, sequence steps are configured, and sending schedule is correct.

## What Causes Broken Sequences

1. **Campaign paused** — Campaign is not active
2. **Missing steps** — Sequence steps not configured
3. **Wrong schedule** — Sending schedule incorrect
4. **No contacts** — No contacts in campaign
5. **Technical issue** — SmartSend bug

## 2-Minute Fix

### Step 1: Check Campaign Status
1. Go to **Campaigns**
2. Find your campaign
3. Check status: Should be "Active"
4. If paused, click "Resume"

### Step 2: Check Sequence Steps
1. Open campaign
2. Go to "Sequence" tab
3. Verify steps are configured:
   - Step 1: Day 0
   - Step 2: Day 3
   - Step 3: Day 7
4. Add missing steps if needed

### Step 3: Check Sending Schedule
1. Go to "Settings" tab
2. Verify sending schedule:
   - Best days: Tuesday-Thursday
   - Best times: 9-11 AM or 2-4 PM
3. Update if incorrect

## Video Guide

[Watch: Sequence Troubleshooting]({{video_url}})

## Expected Results

After fixing:
- **Sequence working:** Follow-ups sending correctly
- **More replies:** Better sequence = more replies
- **Better ROI:** More engagement = more bookings

## How This Helps Roofers

Broken sequences mean missed follow-ups. Fixing this means more homeowners get your messages, which leads to more replies and bookings.
',
    ARRAY['sequence', 'follow up', 'broken', 'not sending'],
    ARRAY['how to fix broken sequence', 'sequence not working', 'follow ups not sending'],
    9
  ),
  (
    'why-campaign-paused',
    'Why Your Campaign is Paused',
    'troubleshooting',
    'Your campaign is paused because you paused it manually, hit sending limits, or had deliverability issues. Fix: check campaign status + resolve issues + resume campaign.',
    '# Why Your Campaign is Paused

## 10-Second Answer

Your campaign is paused because you paused it manually, hit sending limits, or had deliverability issues. Fix: check campaign status + resolve issues + resume campaign.

## Why Campaigns Get Paused

1. **Manual pause** — You paused it
2. **Sending limits** — Hit daily/monthly limits
3. **Deliverability issues** — Too many bounces/spam
4. **Billing issues** — Payment failed
5. **Account issues** — Account suspended

## 2-Minute Fix

### Step 1: Check Campaign Status
1. Go to **Campaigns**
2. Find paused campaign
3. Check "Status" column
4. See reason for pause

### Step 2: Resolve Issues
- **Manual pause:** Click "Resume"
- **Sending limits:** Upgrade plan or wait for reset
- **Deliverability:** Clean list + verify domain
- **Billing:** Update payment method
- **Account:** Contact support

### Step 3: Resume Campaign
1. Click "Resume" on campaign
2. Campaign resumes automatically
3. Check status updates to "Active"

## Video Guide

[Watch: Campaign Pause Troubleshooting]({{video_url}})

## Expected Results

After resuming:
- **Campaign active:** Sending resumes
- **More sends:** Campaign continues
- **More replies:** More sends = more replies

## How This Helps Roofers

Paused campaigns mean no sends. Resuming campaigns means your outreach continues, which leads to more replies and bookings.
',
    ARRAY['paused', 'campaign', 'why paused', 'resume'],
    ARRAY['why is my campaign paused', 'campaign paused', 'how to resume campaign'],
    10
  )
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- SEED DATA: PLAYBOOKS ARTICLES
-- ============================================================================

INSERT INTO kb_articles (slug, title, category, summary, content, search_keywords, roofer_phrases, order_index) VALUES
  (
    'playbook-storm-outreach',
    'Storm Outreach Playbook',
    'playbooks',
    'Complete strategy for capturing storm damage work immediately after weather events. Includes timing, messaging, and follow-up sequences.',
    '# Storm Outreach Playbook

## Overview

This playbook shows you how to capture storm damage work immediately after weather events. Storm work is high-value and homeowners are motivated.

## Strategy

### Phase 1: Preparation (Before Storm)

1. **Monitor Weather**
   - Set up weather alerts for your service area
   - Track storms via weather apps
   - Prepare templates in advance

2. **Prepare Lists**
   - Have homeowner lists ready
   - Segment by area/zip code
   - Keep lists updated

3. **Prepare Team**
   - Schedule inspectors
   - Prepare estimate templates
   - Set up insurance claim process

### Phase 2: Immediate Outreach (0-24 Hours)

1. **Send Within 24 Hours**
   - Use Storm Damage template
   - Target affected areas
   - Lead with urgency

2. **Message Focus**
   - "Quick roof check after {{storm}}"
   - "Insurance usually covers damage"
   - "I can inspect today"

3. **Follow-Up Fast**
   - Day 1: Urgent follow-up
   - Day 3: Final check-in

### Phase 3: Conversion (Days 2-7)

1. **Inspect Immediately**
   - Respond to replies within 1 hour
   - Schedule inspections same day
   - Provide estimates within 24 hours

2. **Insurance Focus**
   - Help with insurance claims
   - Document damage thoroughly
   - Provide claim support

3. **Close Fast**
   - Follow up on estimates daily
   - Address objections quickly
   - Close within 7 days

## Expected Results

- **Open Rate:** 40-50%
- **Reply Rate:** 8-12%
- **Booking Rate:** 3-5%
- **Average Job Value:** $15K-25K

## How This Helps Roofers

Storm work is your highest-value opportunity. This playbook helps you capture it systematically, which leads to more revenue and faster growth.
',
    ARRAY['storm', 'playbook', 'strategy', 'outreach', 'damage'],
    ARRAY['storm outreach playbook', 'storm strategy', 'how to capture storm work'],
    1
  ),
  (
    'playbook-lead-revival',
    'Lead Revival Playbook',
    'playbooks',
    'Systematic approach to re-engaging cold leads and converting old quotes into booked jobs.',
    '# Lead Revival Playbook

## Overview

This playbook shows you how to systematically re-engage cold leads and convert old quotes into booked jobs. Many homeowners delay roof work, so follow-ups work.

## Strategy

### Phase 1: Identify Revival Candidates

1. **Old Quotes (30+ Days)**
   - Quotes sent but not booked
   - Homeowners who requested estimates
   - Past inspection leads

2. **Cold Leads (3-6 Months)**
   - Leads who went quiet
   - Past customers who might need work
   - Inquiries that didn''t convert

3. **Segment by Value**
   - High-value: Full replacements
   - Medium-value: Repairs
   - Low-value: Small fixes

### Phase 2: Revival Sequence

1. **Initial Outreach (Day 0)**
   - Use Lead Revival template
   - Reference original quote/inquiry
   - Offer fresh estimate

2. **Follow-Up (Day 3)**
   - Soft reminder
   - Address common objections
   - Offer incentives if needed

3. **Final Check-In (Day 7)**
   - Last attempt
   - Respectful close-out
   - Leave door open

### Phase 3: Conversion

1. **Respond Fast**
   - Reply within 1 hour
   - Schedule inspection immediately
   - Provide updated estimate

2. **Address Objections**
   - Pricing concerns
   - Timing issues
   - Comparison shopping

3. **Close Systematically**
   - Follow up daily
   - Address concerns
   - Close within 14 days

## Expected Results

- **Open Rate:** 25-35%
- **Reply Rate:** 3-5%
- **Booking Rate:** 1-2%
- **Average Job Value:** $10K-20K

## How This Helps Roofers

Lead revival turns cold leads into warm opportunities. This playbook helps you systematically re-engage past leads, which generates bookings from leads you thought were dead.
',
    ARRAY['lead revival', 'playbook', 'cold leads', 're-engage'],
    ARRAY['lead revival playbook', 'how to revive cold leads', 're-engage old quotes'],
    2
  ),
  (
    'playbook-booked-estimate',
    'Booked Estimate Playbook',
    'playbooks',
    'Complete process for converting booked estimates into closed jobs. Includes inspection, estimate, follow-up, and closing strategies.',
    '# Booked Estimate Playbook

## Overview

This playbook shows you how to convert booked estimates into closed jobs. The estimate is just the beginning — follow-up is critical.

## Strategy

### Phase 1: Pre-Inspection (Before Visit)

1. **Prepare**
   - Review homeowner info
   - Prepare estimate template
   - Schedule 30-45 minutes

2. **Confirm**
   - Confirm appointment 24 hours before
   - Provide arrival window
   - Set expectations

### Phase 2: Inspection (During Visit)

1. **Inspect Thoroughly**
   - Document all damage
   - Take photos
   - Measure accurately

2. **Build Rapport**
   - Be professional
   - Answer questions
   - Show expertise

3. **Present Estimate**
   - Explain work needed
   - Show value
   - Address concerns

### Phase 3: Follow-Up (After Estimate)

1. **Immediate Follow-Up (Day 1)**
   - Thank for time
   - Answer any questions
   - Provide additional info

2. **Regular Follow-Up (Days 3, 7, 14)**
   - Check on decision
   - Address objections
   - Offer incentives if needed

3. **Close (Days 14-30)**
   - Final follow-up
   - Address last concerns
   - Close the deal

## Expected Results

- **Estimate-to-Booking Rate:** 20-30%
- **Average Close Time:** 14-21 days
- **Average Job Value:** $12K-25K

## How This Helps Roofers

Booked estimates are your pipeline. This playbook helps you systematically convert estimates into closed jobs, which drives revenue and growth.
',
    ARRAY['estimate', 'playbook', 'booking', 'inspection', 'close'],
    ARRAY['booked estimate playbook', 'how to convert estimates', 'estimate follow up'],
    3
  ),
  (
    'playbook-seasonality',
    'Roofing Seasonality Playbook',
    'playbooks',
    'Year-round strategy for roofing campaigns. Includes seasonal messaging, timing, and campaign planning.',
    '# Roofing Seasonality Playbook

## Overview

This playbook shows you how to run roofing campaigns year-round. Different seasons require different strategies and messaging.

## Strategy by Season

### Spring (March-May)

**Focus:** Inspections, repairs, replacements
**Messaging:** "Spring is perfect for roof work"
**Templates:** Free Inspection, Repair Follow-Up
**Expected Results:** High open rates, good booking rates

### Summer (June-August)

**Focus:** Replacements, major repairs
**Messaging:** "Beat the heat — get roof done now"
**Templates:** After-Quote Follow-Up, Lead Revival
**Expected Results:** Moderate rates, high-value jobs

### Fall (September-November)

**Focus:** Pre-winter prep, last-minute repairs
**Messaging:** "Prepare for winter — fix roof now"
**Templates:** Seasonal Winter Leaks, Repair Follow-Up
**Expected Results:** High urgency, fast closes

### Winter (December-February)

**Focus:** Emergency repairs, leak fixes
**Messaging:** "Winter leaks? I can help today"
**Templates:** Storm Damage, Seasonal Winter Leaks
**Expected Results:** High urgency, emergency work

## Year-Round Strategy

1. **Always Running**
   - Lead Revival (monthly)
   - Free Inspection (weekly)
   - Repair Follow-Up (as needed)

2. **Seasonal Campaigns**
   - Spring: Inspection blitz
   - Summer: Replacement focus
   - Fall: Pre-winter prep
   - Winter: Emergency repairs

3. **Consistent Follow-Up**
   - Follow up on all quotes
   - Re-engage cold leads
   - Ask for referrals

## Expected Results

- **Year-Round Pipeline:** Consistent bookings
- **Seasonal Peaks:** 2-3x normal volume
- **Average Job Value:** $10K-25K

## How This Helps Roofers

Seasonality helps you plan campaigns strategically. This playbook ensures you have consistent pipeline year-round, with seasonal peaks for maximum revenue.
',
    ARRAY['seasonality', 'playbook', 'seasonal', 'year round'],
    ARRAY['roofing seasonality playbook', 'seasonal campaigns', 'year round strategy'],
    4
  ),
  (
    'playbook-handle-replies',
    'Handling Homeowner Replies Playbook',
    'playbooks',
    'Complete system for responding to homeowner replies. Includes classification, prioritization, and response strategies.',
    '# Handling Homeowner Replies Playbook

## Overview

This playbook shows you how to systematically handle every homeowner reply. Fast, helpful responses convert leads into bookings.

## Strategy

### Phase 1: Classification

1. **Hot Leads (80-100 Score)**
   - Want estimate/appointment
   - Urgent repair needed
   - Ready to book

2. **Warm Leads (60-79 Score)**
   - Interested but not urgent
   - Pricing questions
   - Considering options

3. **Follow-Up Needed (40-59 Score)**
   - Unclear intent
   - Questions to answer
   - Needs clarification

4. **Not Interested (0-39 Score)**
   - Declined
   - Unsubscribed
   - Spam

### Phase 2: Response Strategy

1. **Hot Leads: Respond in 1 Hour**
   - Call immediately
   - Schedule inspection
   - Send estimate link
   - Follow up daily

2. **Warm Leads: Respond in 24 Hours**
   - Answer questions
   - Provide pricing
   - Schedule follow-up
   - Follow up weekly

3. **Follow-Up Needed: Respond in 48 Hours**
   - Clarify intent
   - Answer questions
   - Provide info
   - Follow up as needed

4. **Not Interested: Respect Choice**
   - Stop sending
   - Remove from list
   - Don''t follow up

### Phase 3: Conversion

1. **Fast Response**
   - Respond within 1 hour (hot)
   - Respond within 24 hours (warm)
   - Use AI Reply Assistant

2. **Helpful Responses**
   - Answer questions
   - Provide value
   - Be professional
   - Show expertise

3. **Systematic Follow-Up**
   - Follow up daily (hot)
   - Follow up weekly (warm)
   - Track in pipeline
   - Close systematically

## Expected Results

- **Hot Lead Conversion:** 30-40%
- **Warm Lead Conversion:** 10-15%
- **Average Response Time:** < 2 hours
- **Booking Rate:** 15-25% of replies

## How This Helps Roofers

Fast, helpful responses convert leads into bookings. This playbook ensures you handle every reply systematically, which maximizes conversions and revenue.
',
    ARRAY['replies', 'playbook', 'response', 'handling', 'inbox'],
    ARRAY['handling replies playbook', 'how to respond', 'reply strategy'],
    5
  ),
  (
    'playbook-crew-scheduling',
    'Crew Scheduling + SmartSend Coordination',
    'playbooks',
    'How to coordinate SmartSend campaigns with your crew schedule. Includes scheduling, capacity planning, and workflow optimization.',
    '# Crew Scheduling + SmartSend Coordination Playbook

## Overview

This playbook shows you how to coordinate SmartSend campaigns with your crew schedule. Proper coordination ensures you can handle the leads you generate.

## Strategy

### Phase 1: Capacity Planning

1. **Assess Capacity**
   - How many jobs can you handle per week?
   - How many crews do you have?
   - What''s your inspection capacity?

2. **Plan Campaigns**
   - Match campaign volume to capacity
   - Don''t over-promise
   - Plan for seasonal peaks

3. **Buffer for Growth**
   - Leave 20% buffer for unexpected work
   - Plan for storm work
   - Account for delays

### Phase 2: Campaign Coordination

1. **Schedule Campaigns**
   - Launch when you have capacity
   - Pause when at capacity
   - Resume when capacity opens

2. **Manage Inbox**
   - Respond to hot leads immediately
   - Schedule inspections efficiently
   - Batch similar work

3. **Optimize Workflow**
   - Use SmartSend scheduler
   - Sync with calendar
   - Automate reminders

### Phase 3: Scaling

1. **Add Capacity**
   - Hire more crews
   - Add inspectors
   - Expand service area

2. **Increase Campaigns**
   - Launch more campaigns
   - Target new areas
   - Expand templates

3. **Optimize Process**
   - Streamline inspections
   - Faster estimates
   - Better follow-up

## Expected Results

- **Capacity Utilization:** 80-90%
- **Lead-to-Job Conversion:** 20-30%
- **Average Job Value:** $12K-25K
- **Revenue Growth:** 2-3x per year

## How This Helps Roofers

Proper coordination ensures you can handle the leads you generate. This playbook helps you scale systematically, which drives revenue growth without overwhelming your team.
',
    ARRAY['scheduling', 'playbook', 'crew', 'coordination', 'capacity'],
    ARRAY['crew scheduling playbook', 'coordinate campaigns', 'capacity planning'],
    6
  ),
  (
    'playbook-multi-campaign',
    'Multi-Campaign Strategy',
    'playbooks',
    'How to run multiple campaigns simultaneously. Includes campaign planning, segmentation, and performance optimization.',
    '# Multi-Campaign Strategy Playbook

## Overview

This playbook shows you how to run multiple campaigns simultaneously. Multiple campaigns increase reach and revenue.

## Strategy

### Phase 1: Campaign Planning

1. **Identify Campaign Types**
   - Lead Revival (monthly)
   - Free Inspection (weekly)
   - Storm Damage (as needed)
   - Repair Follow-Up (as needed)

2. **Segment Lists**
   - By area/zip code
   - By property age
   - By past interaction
   - By job type

3. **Plan Schedule**
   - Stagger campaign launches
   - Avoid overlap
   - Plan for capacity

### Phase 2: Campaign Execution

1. **Launch Systematically**
   - Start with 1-2 campaigns
   - Add more as you scale
   - Monitor performance

2. **Manage Inbox**
   - All replies in one inbox
   - Prioritize hot leads
   - Respond systematically

3. **Track Performance**
   - Monitor open rates
   - Track reply rates
   - Measure bookings

### Phase 3: Optimization

1. **Optimize Campaigns**
   - Improve low performers
   - Scale high performers
   - Pause underperformers

2. **Refine Lists**
   - Remove unengaged
   - Add new segments
   - Clean regularly

3. **Scale Systematically**
   - Add campaigns gradually
   - Monitor capacity
   - Optimize workflow

## Expected Results

- **Total Campaigns:** 3-5 active
- **Combined Open Rate:** 25-35%
- **Combined Reply Rate:** 5-8%
- **Revenue Growth:** 2-3x single campaign

## How This Helps Roofers

Multiple campaigns increase reach and revenue. This playbook helps you run multiple campaigns systematically, which maximizes bookings and revenue.
',
    ARRAY['multi campaign', 'playbook', 'strategy', 'multiple campaigns'],
    ARRAY['multi campaign strategy', 'run multiple campaigns', 'campaign planning'],
    7
  ),
  (
    'playbook-scale-crews',
    'How to Scale to 3+ Crews Using SmartSend',
    'playbooks',
    'Complete guide for scaling your roofing business to 3+ crews using SmartSend. Includes hiring, training, and workflow optimization.',
    '# How to Scale to 3+ Crews Using SmartSend

## Overview

This playbook shows you how to scale your roofing business to 3+ crews using SmartSend. Proper scaling ensures sustainable growth.

## Strategy

### Phase 1: Foundation (1-2 Crews)

1. **Master SmartSend**
   - Run 2-3 campaigns
   - Handle inbox efficiently
   - Convert 20-30% of leads

2. **Optimize Process**
   - Streamline inspections
   - Faster estimates
   - Better follow-up

3. **Build Systems**
   - Document processes
   - Train team
   - Set standards

### Phase 2: Scaling (3-5 Crews)

1. **Add Capacity**
   - Hire crews systematically
   - Add inspectors
   - Expand service area

2. **Increase Campaigns**
   - Launch 5-7 campaigns
   - Target new areas
   - Expand templates

3. **Delegate Inbox**
   - Train team on replies
   - Set response standards
   - Monitor quality

### Phase 3: Optimization (5+ Crews)

1. **Optimize Workflow**
   - Automate where possible
   - Streamline processes
   - Reduce bottlenecks

2. **Scale Campaigns**
   - Launch 10+ campaigns
   - Target multiple markets
   - Expand reach

3. **Manage Team**
   - Hire managers
   - Delegate effectively
   - Monitor performance

## Expected Results

- **Crews:** 3-5 active crews
- **Campaigns:** 5-10 active
- **Monthly Revenue:** $100K-300K
- **Growth Rate:** 2-3x per year

## How This Helps Roofers

Scaling to 3+ crews requires systematic approach. This playbook helps you scale systematically, which drives sustainable growth and revenue.
',
    ARRAY['scale', 'playbook', 'crews', 'growth', 'scaling'],
    ARRAY['scale to 3 crews', 'how to scale', 'grow roofing business'],
    8
  )
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- SEED DATA: VIDEOS ARTICLES
-- ============================================================================

INSERT INTO kb_articles (slug, title, category, summary, content, video_url, video_duration, search_keywords, roofer_phrases, order_index) VALUES
  (
    'video-launch-campaign',
    'Launch a Campaign (60 seconds)',
    'videos',
    'Quick video showing how to launch your first campaign in under 60 seconds.',
    '# Launch a Campaign

Watch this 60-second video to learn how to launch your first campaign.

## What You''ll Learn

- How to create a new campaign
- How to import your list
- How to choose a template
- How to launch

## Video

[Watch: Launch a Campaign]({{video_url}})

Duration: 60 seconds
',
    'https://example.com/videos/launch-campaign.mp4',
    60,
    ARRAY['video', 'launch', 'campaign', 'tutorial'],
    ARRAY['how to launch campaign', 'launch campaign video'],
    1
  ),
  (
    'video-upload-list',
    'Upload Your List (90 seconds)',
    'videos',
    'Quick video showing how to upload and import your contact list.',
    '# Upload Your List

Watch this 90-second video to learn how to upload and import your contact list.

## What You''ll Learn

- How to prepare your CSV
- How to upload your list
- How to clean your list
- How to start using it

## Video

[Watch: Upload Your List]({{video_url}})

Duration: 90 seconds
',
    'https://example.com/videos/upload-list.mp4',
    90,
    ARRAY['video', 'upload', 'list', 'import'],
    ARRAY['how to upload list', 'import contacts video'],
    2
  ),
  (
    'video-respond-hot-lead',
    'Respond to a Hot Lead (60 seconds)',
    'videos',
    'Quick video showing how to respond to hot leads in your Inbox.',
    '# Respond to a Hot Lead

Watch this 60-second video to learn how to respond to hot leads in your Inbox.

## What You''ll Learn

- How to identify hot leads
- How to respond quickly
- How to book estimates
- How to follow up

## Video

[Watch: Respond to Hot Leads]({{video_url}})

Duration: 60 seconds
',
    'https://example.com/videos/respond-hot-lead.mp4',
    60,
    ARRAY['video', 'respond', 'hot lead', 'inbox'],
    ARRAY['how to respond to hot lead', 'respond to replies video'],
    3
  ),
  (
    'video-fix-open-rate',
    'Fix Your Open Rate Fast (90 seconds)',
    'videos',
    'Quick video showing how to fix low open rates in 2 minutes.',
    '# Fix Your Open Rate Fast

Watch this 90-second video to learn how to fix low open rates quickly.

## What You''ll Learn

- How to clean your list
- How to improve subject lines
- How to check timing
- How to monitor results

## Video

[Watch: Fix Open Rates]({{video_url}})

Duration: 90 seconds
',
    'https://example.com/videos/fix-open-rate.mp4',
    90,
    ARRAY['video', 'open rate', 'fix', 'troubleshooting'],
    ARRAY['how to fix open rate', 'fix open rate video'],
    4
  ),
  (
    'video-best-template',
    'Best Template for Slow Weeks (60 seconds)',
    'videos',
    'Quick video showing which template to use during slow weeks.',
    '# Best Template for Slow Weeks

Watch this 60-second video to learn which template to use during slow weeks.

## What You''ll Learn

- Which template works best
- When to use it
- How to customize it
- Expected results

## Video

[Watch: Best Template for Slow Weeks]({{video_url}})

Duration: 60 seconds
',
    'https://example.com/videos/best-template.mp4',
    60,
    ARRAY['video', 'template', 'slow weeks', 'lead generation'],
    ARRAY['best template for slow weeks', 'template video'],
    5
  ),
  (
    'video-storm-day',
    'Storm Day Instructions (120 seconds)',
    'videos',
    'Quick video showing what to do on storm days to capture storm damage work.',
    '# Storm Day Instructions

Watch this 2-minute video to learn what to do on storm days.

## What You''ll Learn

- How to prepare for storms
- When to send campaigns
- What to say in messages
- How to follow up

## Video

[Watch: Storm Day Instructions]({{video_url}})

Duration: 120 seconds
',
    'https://example.com/videos/storm-day.mp4',
    120,
    ARRAY['video', 'storm', 'damage', 'instructions'],
    ARRAY['storm day instructions', 'storm video'],
    6
  ),
  (
    'video-office-assistant',
    'Using SmartSend Like a $20/hr Office Assistant (90 seconds)',
    'videos',
    'Quick video showing how to use SmartSend like a $20/hr office assistant.',
    '# Using SmartSend Like a $20/hr Office Assistant

Watch this 90-second video to learn how to use SmartSend like a $20/hr office assistant.

## What You''ll Learn

- How to automate follow-ups
- How to handle replies
- How to manage campaigns
- How to save time

## Video

[Watch: Office Assistant]({{video_url}})

Duration: 90 seconds
',
    'https://example.com/videos/office-assistant.mp4',
    90,
    ARRAY['video', 'automation', 'assistant', 'time saving'],
    ARRAY['office assistant video', 'automate with smartsend'],
    7
  )
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- SEED DATA: BILLING ARTICLES
-- ============================================================================

INSERT INTO kb_articles (slug, title, category, summary, content, search_keywords, roofer_phrases, order_index) VALUES
  (
    'billing-update-card',
    'How to Update Your Card',
    'billing',
    'Update your payment card in Settings → Billing → Payment Method. Takes 30 seconds.',
    '# How to Update Your Card

## Quick Steps

1. Go to **Settings** → **Billing**
2. Click "Update Payment Method"
3. Enter new card details
4. Click "Save"

## Detailed Guide

### Step 1: Go to Billing Settings
1. Click **Settings** in sidebar
2. Go to **Billing** section
3. Find "Payment Method" section

### Step 2: Update Card
1. Click "Update Payment Method"
2. Enter card number
3. Enter expiration date
4. Enter CVV
5. Enter billing zip code
6. Click "Save"

### Step 3: Verify
- Check card shows as "Active"
- Verify billing address
- Confirm subscription continues

## Troubleshooting

**"Card declined"**
- Check card details are correct
- Verify card has funds
- Check expiration date
- Contact your bank

**"Update failed"**
- Try different browser
- Clear cache/cookies
- Contact support

## How This Helps Roofers

Updating your card ensures uninterrupted service. This means your campaigns continue running without interruption.
',
    ARRAY['billing', 'card', 'payment', 'update'],
    ARRAY['how to update card', 'change payment method', 'update billing'],
    1
  ),
  (
    'billing-change-plan',
    'How to Change Your Plan',
    'billing',
    'Change your plan in Settings → Billing → Plan. Upgrade or downgrade anytime.',
    '# How to Change Your Plan

## Quick Steps

1. Go to **Settings** → **Billing**
2. Click "Change Plan"
3. Select new plan
4. Confirm change

## Detailed Guide

### Step 1: Go to Billing Settings
1. Click **Settings** in sidebar
2. Go to **Billing** section
3. Find "Plan" section

### Step 2: Change Plan
1. Click "Change Plan"
2. Review available plans
3. Select new plan
4. Review pricing
5. Click "Confirm"

### Step 3: Verify
- Check plan shows as "Active"
- Verify billing amount
- Confirm features unlocked

## Plan Options

- **Starter:** $X/month — Basic features
- **Pro:** $X/month — Advanced features
- **Enterprise:** Custom — All features

## Troubleshooting

**"Change failed"**
- Check payment method is valid
- Verify you have permission
- Contact support

**"Features not unlocked"**
- Wait 5-10 minutes
- Refresh page
- Contact support

## How This Helps Roofers

Changing your plan lets you scale up or down based on your needs. This means you only pay for what you use.
',
    ARRAY['billing', 'plan', 'upgrade', 'downgrade', 'change'],
    ARRAY['how to change plan', 'upgrade plan', 'change subscription'],
    2
  ),
  (
    'billing-pause-account',
    'How to Pause Your Account',
    'billing',
    'Pause your account in Settings → Billing → Account. Paused accounts don''t send emails but keep your data.',
    '# How to Pause Your Account

## Quick Steps

1. Go to **Settings** → **Billing**
2. Click "Pause Account"
3. Confirm pause
4. Account paused (no charges)

## Detailed Guide

### Step 1: Go to Billing Settings
1. Click **Settings** in sidebar
2. Go to **Billing** section
3. Find "Account" section

### Step 2: Pause Account
1. Click "Pause Account"
2. Review what happens:
   - Campaigns stop sending
   - Data is preserved
   - No charges while paused
3. Confirm pause

### Step 3: Verify
- Check account shows as "Paused"
- Verify campaigns stopped
- Confirm no charges

## What Happens When Paused

- **Campaigns:** Stop sending immediately
- **Data:** Preserved (contacts, history)
- **Billing:** No charges while paused
- **Access:** Can still log in and view data

## How to Resume

1. Go to **Settings** → **Billing**
2. Click "Resume Account"
3. Confirm resume
4. Account active (billing resumes)

## How This Helps Roofers

Pausing your account lets you take a break without losing data. This means you can pause during slow seasons and resume when ready.
',
    ARRAY['billing', 'pause', 'account', 'suspend'],
    ARRAY['how to pause account', 'pause subscription', 'suspend account'],
    3
  ),
  (
    'billing-reactivate',
    'How to Re-Activate Your Account',
    'billing',
    'Re-activate your account in Settings → Billing → Account. Click "Resume Account" and billing resumes.',
    '# How to Re-Activate Your Account

## Quick Steps

1. Go to **Settings** → **Billing**
2. Click "Resume Account"
3. Confirm resume
4. Account active (billing resumes)

## Detailed Guide

### Step 1: Go to Billing Settings
1. Click **Settings** in sidebar
2. Go to **Billing** section
3. Find "Account" section

### Step 2: Resume Account
1. Click "Resume Account"
2. Review what happens:
   - Campaigns resume sending
   - Billing resumes
   - All features unlocked
3. Confirm resume

### Step 3: Verify
- Check account shows as "Active"
- Verify campaigns resumed
- Confirm billing resumed

## What Happens When Resumed

- **Campaigns:** Resume sending immediately
- **Billing:** Charges resume
- **Access:** Full access restored
- **Data:** All data preserved

## Troubleshooting

**"Resume failed"**
- Check payment method is valid
- Verify card has funds
- Contact support

**"Campaigns not resuming"**
- Wait 5-10 minutes
- Refresh page
- Manually resume campaigns

## How This Helps Roofers

Re-activating your account lets you resume campaigns quickly. This means you can start generating leads again immediately.
',
    ARRAY['billing', 'reactivate', 'resume', 'account'],
    ARRAY['how to reactivate account', 'resume subscription', 'reactivate'],
    4
  ),
  (
    'billing-stripe-troubleshooting',
    'Stripe Troubleshooting',
    'billing',
    'Common Stripe payment issues and how to fix them. Includes card declines, failed payments, and billing errors.',
    '# Stripe Troubleshooting

## Common Issues

### Card Declined

**What it means:** Your card was declined by your bank.

**How to fix:**
1. Check card details are correct
2. Verify card has funds
3. Check expiration date
4. Contact your bank
5. Try different card

### Failed Payment

**What it means:** Payment processing failed.

**How to fix:**
1. Check payment method is valid
2. Verify billing address matches card
3. Try different browser
4. Clear cache/cookies
5. Contact support

### Billing Error

**What it means:** Billing system error.

**How to fix:**
1. Wait 5-10 minutes
2. Try again
3. Contact support if persists

## Still Need Help?

Contact SmartSend support:
- Email: support@smartsend.ai
- Chat: Available in app
- Response time: < 24 hours

## How This Helps Roofers

Fixing billing issues quickly ensures uninterrupted service. This means your campaigns continue running without interruption.
',
    ARRAY['billing', 'stripe', 'troubleshooting', 'payment', 'error'],
    ARRAY['stripe troubleshooting', 'payment error', 'billing issue'],
    5
  ),
  (
    'billing-faq',
    'Billing FAQ',
    'billing',
    'Frequently asked questions about billing, plans, and payments.',
    '# Billing FAQ

## Common Questions

### How do I update my card?
Go to Settings → Billing → Payment Method → Update Card.

### How do I change my plan?
Go to Settings → Billing → Plan → Change Plan.

### How do I pause my account?
Go to Settings → Billing → Account → Pause Account.

### How do I cancel?
Contact support to cancel your account.

### When am I charged?
You''re charged monthly on your billing date.

### Can I get a refund?
Refunds are handled case-by-case. Contact support.

### What happens if payment fails?
We''ll retry payment. If it fails, your account will be paused.

### Can I change billing cycle?
Contact support to change your billing cycle.

## Still Need Help?

Contact SmartSend support:
- Email: support@smartsend.ai
- Chat: Available in app
- Response time: < 24 hours

## How This Helps Roofers

Understanding billing helps you manage your account effectively. This means you can focus on generating leads instead of worrying about billing.
',
    ARRAY['billing', 'faq', 'questions', 'help'],
    ARRAY['billing faq', 'billing questions', 'payment help'],
    6
  )
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- SEED DATA: CONTEXTUAL TRIGGERS
-- ============================================================================

INSERT INTO kb_contextual_triggers (trigger_type, article_id, priority) 
SELECT 
  'first_campaign',
  id,
  10
FROM kb_articles 
WHERE slug = 'create-first-campaign'
ON CONFLICT DO NOTHING;

INSERT INTO kb_contextual_triggers (trigger_type, article_id, priority) 
SELECT 
  'first_reply',
  id,
  10
FROM kb_articles 
WHERE slug = 'what-replies-mean'
ON CONFLICT DO NOTHING;

INSERT INTO kb_contextual_triggers (trigger_type, article_id, priority) 
SELECT 
  'low_open_rate',
  id,
  10
FROM kb_articles 
WHERE slug = 'low-open-rate'
ON CONFLICT DO NOTHING;

INSERT INTO kb_contextual_triggers (trigger_type, article_id, priority) 
SELECT 
  'campaign_paused',
  id,
  10
FROM kb_articles 
WHERE slug = 'why-campaign-paused'
ON CONFLICT DO NOTHING;

