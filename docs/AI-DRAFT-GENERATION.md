# AI Draft Generation System

This system allows you to generate AI-powered email drafts for your campaigns, review them, and integrate approved drafts into your sending pipeline.

## Setup

### 1. Database Migration

Run the migration to create the required tables:

```bash
# Apply the migration
supabase db push
```

Or manually run the SQL from `supabase/migrations/20241220_ai_drafts_schema.sql`

### 2. Environment Variables

Add these to your `.env.local` file:

```env
# Required for AI draft generation
OPENAI_API_KEY=your_openai_api_key_here

# Required for server-side operations
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
```

### 3. Integration

Add the components to your campaign page:

```tsx
import { GenerateDraftsButton } from "@/components/drafts/GenerateDraftsButton";
import DraftReviewDrawer from "@/components/drafts/DraftReviewDrawer";

// In your campaign page component
<div className="flex gap-3">
  <GenerateDraftsButton campaignId={campaignId} />
  <DraftReviewDrawer campaignId={campaignId} />
</div>
```

### 4. Send Queue Integration

Use the utility functions to integrate approved drafts into your sending pipeline:

```tsx
import { getApprovedDrafts, getDraftForLead } from "@/lib/drafts";

// When sending emails, check for approved drafts first
const draft = await getDraftForLead(lead.id);
if (draft) {
  // Use AI-generated content
  const subject = draft.subject;
  const body = markdownToHtml(draft.body_markdown);
} else {
  // Fall back to your existing templates
}
```

## Features

- **AI Draft Generation**: Generate personalized email drafts using OpenAI GPT-4o-mini
- **Batch Processing**: Generate up to 25 drafts at once
- **Review Interface**: Review, approve, or reject generated drafts
- **Status Tracking**: Track draft status (draft, approved, rejected)
- **Integration Ready**: Easy integration with existing send queues

## Usage Flow

1. **Generate**: Click "Generate AI Drafts" to create drafts for all leads in a campaign
2. **Review**: Click "Review Drafts" to see generated drafts in a side drawer
3. **Approve/Reject**: Review each draft and approve or reject it
4. **Send**: Approved drafts are automatically used when sending emails

## Cost Management

- Generates drafts in batches of 25 to manage API costs
- Uses GPT-4o-mini for cost efficiency
- Consider adding per-campaign or daily quotas if needed

## Security Notes

- `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` are server-only
- RLS policies ensure users only see their own data
- All API routes are protected and validate user ownership

## Customization

You can customize the AI prompt in `/src/app/api/drafts/generate/route.ts` to match your brand voice and requirements.