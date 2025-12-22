# Template Variants A/B Testing Implementation

## Overview
This implementation adds a complete A/B testing system for email campaigns, allowing you to create multiple template variants and automatically split sends across them based on configured weights.

## What Was Created

### 1. SQL Migrations

#### `supabase/migrations/20250217000000_create_template_variants.sql`
- **campaign_templates**: Base templates for each campaign
- **template_variants**: AI-generated variants with configurable weights
- **variant_metrics**: View for tracking variant performance (opens, clicks, replies)
- **variant_winners**: View to identify top-performing variants
- Full RLS policies for secure access

#### `supabase/migrations/20250217000001_add_variant_to_send_queue.sql`
- Adds `template_variant_id` column to `send_queue` table
- Creates index for performance

### 2. Core Utilities

#### `src/lib/templates/merge.ts`
- `applyMergeTags()`: Replaces {{tags}} in HTML content
- `withFooterUnsub()`: Appends unsubscribe footer with signed token

#### `src/lib/templates/variant-selector.ts`
- `buildRoundRobin()`: Creates weighted distribution for variant selection
- Handles round-robin picking based on variant weights

### 3. API Endpoints

#### `src/app/api/templates/rewrite/route.ts`
- Generates template variants using OpenAI (with graceful fallback)
- Supports configurable tone, CTA style, and length
- Saves variants to database with auto-calculated weights
- Falls back to local heuristics if OpenAI is unavailable

#### `src/app/api/campaigns/[id]/enqueue/route.ts` (Updated)
- Auto-selects variants using round-robin weighted distribution
- Applies merge tags to subject and body
- Adds unsubscribe footer to each email
- Tracks which variant was used per email via `template_variant_id`

### 4. UI Components

#### `app/campaigns/[id]/templates/page.tsx`
- Simple interface for generating variants
- Input fields for base subject and HTML
- Configurable number of variants to generate

## Usage Flow

1. **Create Templates** (Via SQL or API):
   ```sql
   INSERT INTO campaign_templates (campaign_id, user_id, subject, body_html)
   VALUES ('campaign-id', 'user-id', 'Your subject', '<p>Your HTML</p>');
   ```

2. **Generate Variants** (Via UI or API):
   - Navigate to `/campaigns/[id]/templates`
   - Enter base subject and HTML
   - Click "Generate Variants"
   - AI creates 2-5 variants with different hooks/tone

3. **Enqueue Campaign**:
   - Call `/api/campaigns/[id]/enqueue`
   - System automatically:
     - Loads all variants for the campaign
     - Creates weighted round-robin distribution
     - Assigns variant to each contact in sequence
     - Applies merge tags ({{first_name}}, {{company}}, etc.)
     - Adds unsubscribe footer
     - Stores `template_variant_id` for analytics

4. **Track Performance**:
   ```sql
   -- View all variant metrics
   SELECT * FROM variant_metrics WHERE campaign_id = 'your-id';
   
   -- Find winning variant
   SELECT * FROM variant_winners WHERE campaign_id = 'your-id';
   ```

## Merge Tags Supported

- `{{first_name}}`: Contact's first name
- `{{company}}`: Contact's company name
- `{{email}}`: Contact's email address
- `{{cta_url}}`: Custom CTA URL (if provided)

## Variant Weighting

Variants are distributed using a weighted round-robin algorithm:
- Weight 50% = 10 slots in a 20-slot wheel
- Weight 30% = 6 slots in a 20-slot wheel
- Weight 20% = 4 slots in a 20-slot wheel

Total weights are automatically normalized to 100%.

## Metrics Tracked

The `variant_metrics` view provides:
- **sent**: Number of emails sent with this variant
- **opens**: Number of opens
- **clicks**: Number of clicks
- **replies**: Number of replies
- **open_rate**: Percentage
- **click_rate**: Percentage
- **reply_rate**: Percentage

## Optional: Auto-Promote Winners

You can create a scheduled job to promote winning variants:

```sql
-- After N sends, promote the variant with highest reply rate
UPDATE template_variants
SET weight = 70
WHERE id IN (
  SELECT variant_id FROM variant_winners WHERE campaign_id = 'your-id'
);

-- Then normalize others
UPDATE template_variants
SET weight = 30
WHERE campaign_template_id IN (
  SELECT id FROM campaign_templates WHERE campaign_id = 'your-id'
)
AND id NOT IN (SELECT variant_id FROM variant_winners WHERE campaign_id = 'your-id');
```

## Example API Call

```javascript
// Generate variants
const response = await fetch('/api/templates/rewrite', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    campaignId: 'campaign-123',
    baseSubject: 'Quick idea for {{first_name}}',
    baseHtml: '<p>Hi {{first_name}}, check out {{cta_url}}</p>',
    qty: 3,
    tone: 'curious',
    ctaStyle: 'reply-yes',
    length: 'short'
  })
});

// Enqueue campaign (variants are auto-selected)
const enqueue = await fetch('/api/campaigns/campaign-123/enqueue', {
  method: 'POST'
});
```

## Testing

1. Run migrations:
   ```bash
   # Apply to Supabase
   supabase db push
   ```

2. Create a test campaign and add contacts

3. Generate variants via UI or API

4. Enqueue and check `send_queue` table for `template_variant_id` values

5. Query `variant_metrics` view to see distribution

## Notes

- OpenAI API key is optional; fallback heuristics will be used
- Variants must exist before enqueueing, or the base template is used
- Weights can be manually adjusted in the database
- The footer is automatically appended with signed unsubscribe tokens
- RLS policies ensure users can only access their own templates/variants