# A/B Testing Implementation Summary

## Overview
This implementation adds A/B testing capabilities to SmartSend AI email campaigns, allowing users to generate multiple email variants and automatically split sends across variants based on weights. The system tracks variant performance and provides metrics for optimization.

## Files Created

### 1. SQL Migration
**File**: `supabase/migrations/20250200_template_variants_ab_testing.sql`

Creates:
- `campaign_templates` table - Base templates per campaign
- `template_variants` table - AI-generated variants with weights
- Adds `template_variant_id` column to `email_logs` for analytics
- `variant_metrics` view - Aggregated metrics per variant (sent, opens, clicks, replies, rates)
- `variant_winners` view - Identifies winning variants after minimum volume (50 sends)
- RLS policies for all tables

### 2. Helper Library
**File**: `lib/templates/merge.ts`

Functions:
- `applyMergeTags(html, merge)` - Replaces `{{key}}` tags with values from merge object
- `withFooterUnsub(bodyHtml, userId, recipientEmail, campaignId)` - Adds unsubscribe footer with signed token

### 3. API Route for Variant Generation
**File**: `src/app/api/templates/rewrite/route.ts`

Endpoint: `POST /api/templates/rewrite`

Features:
- Generates 1-5 variants using OpenAI GPT-4o-mini
- Falls back to heuristic-based generation if OpenAI unavailable
- Automatically creates base template if it doesn't exist
- Configurable tone, CTA style, and length
- Saves variants with equal default weights

Parameters:
- `campaignId` - Campaign identifier
- `baseSubject` - Original subject line
- `baseHtml` - Original HTML body
- `qty` - Number of variants to generate (1-5)
- `tone` - friendly | curious | direct | case-study
- `ctaStyle` - book-call | reply-yes | visit-link
- `length` - short | medium | long

### 4. Updated Enqueue Route
**File**: `src/app/api/campaigns/queue/route.ts`

Changes:
- Queries for template variants when enqueueing
- Builds weighted round-robin wheel for variant selection
- Applies merge tags to each variant ({{first_name}}, {{company}}, {{cta_url}}, etc.)
- Adds unsubscribe footer to each email
- Stores rendered content in `send_queue` with `template_variant_id`
- Returns variant count in response

### 5. UI Page for Variant Generation
**File**: `src/app/campaigns/[id]/templates/page.tsx`

Features:
- Form to enter base subject and HTML
- Generate button to create variants
- Configurable quantity (1-5 variants)
- Help text explaining merge tag usage
- Toast notifications for success/errors

## How It Works

### 1. Creating Variants
1. Navigate to `/campaigns/[id]/templates`
2. Enter base subject and HTML body
3. Optionally configure merge tags like `{{first_name}}`, `{{company}}`, `{{cta_url}}`
4. Click "Generate Variants"
5. System creates variants using AI or heuristics

### 2. Enqueueing with A/B Split
1. When enqueueing contacts, system automatically:
   - Queries available variants for the campaign
   - Builds a weighted round-robin wheel (variant weights determine distribution)
   - Selects a variant for each contact
   - Applies merge tags to personalize content
   - Adds unsubscribe footer
   - Stores rendered subject, body_html, and template_variant_id in send_queue

### 3. Tracking Performance
Metrics are automatically calculated via the `variant_metrics` view:
- Total sent
- Opens, clicks, replies
- Open rate, click rate, reply rate
- Weight distribution

### 4. Finding Winners (Optional)
The `variant_winners` view automatically identifies top-performing variants:
- Minimum 50 sends required
- Sorted by reply rate, then sent count
- Can be used by admin tasks to promote winners (e.g., increase weight to 70%)

## Merge Tags

Available tags that are automatically replaced:
- `{{first_name}}` - Contact's first name
- `{{company}}` - Contact's company
- `{{cta_url}}` - CTA link (if provided)
- Any custom fields from the contact

Unused tags are safely removed from the final HTML.

## Database Schema

### campaign_templates
```sql
- id (uuid)
- campaign_id (uuid) → campaigns
- user_id (uuid) → auth.users
- name (text, default: 'Default')
- subject (text)
- body_html (text)
- is_active (boolean, default: true)
- created_at (timestamptz)
```

### template_variants
```sql
- id (uuid)
- campaign_template_id (uuid) → campaign_templates
- user_id (uuid) → auth.users
- label (text, e.g. "V1: Curious hook")
- subject (text)
- body_html (text)
- weight (int, default: 50)
- created_at (timestamptz)
```

### email_logs (updated)
- Added: `template_variant_id (uuid)` → template_variants

### send_queue (updated)
- Added: `template_variant_id (uuid)` → template_variants

## Security

- All tables have RLS enabled
- Users can only access their own templates/variants
- HMAC-signed unsubscribe tokens for security
- No sensitive data exposed in variant generation

## Usage Example

```typescript
// Generate variants
POST /api/templates/rewrite
{
  "campaignId": "123",
  "baseSubject": "Quick idea for {{company}}",
  "baseHtml": "Hi {{first_name}}, saw {{company}} and thought...",
  "qty": 3,
  "tone": "curious",
  "ctaStyle": "reply-yes",
  "length": "short"
}

// Result: Creates 3 variants with equal weights (33% each)
```

## Future Enhancements

1. **Auto-promote winners**: Cron job to increase winner weight after N sends
2. **Statistical significance**: Highlight when results are statistically meaningful
3. **Weight editor**: UI to manually adjust variant weights
4. **Preview variants**: Show rendered examples before enqueueing
5. **Multi-variant tests**: Support testing subject AND body simultaneously