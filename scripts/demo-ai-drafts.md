# AI Draft Feature Demo Guide

## Quick Start Demo

This guide shows you how to test the AI Draft feature in under 5 minutes.

### Prerequisites

1. ✅ Database migration applied (`supabase db push`)
2. ✅ Development server running (`npm run dev`)
3. ✅ OpenAI API key configured
4. ✅ Supabase credentials configured

### Step 1: Send a Test Email

1. Go to your campaign dashboard
2. Send a test email to yourself
3. Reply to the email with a message like:
   > "Hi, I'm interested in your product. Can you tell me more about pricing and features?"

### Step 2: Check the Inbox

1. Navigate to `/dashboard/inbox`
2. You should see your reply in the list
3. Click on the thread to open it

### Step 3: Test AI Draft Generation

1. In the thread view, you'll see your incoming message
2. Below the message, look for the "Generate AI Reply" button
3. Click the button - it should show a loading spinner
4. After a few seconds, you'll see an AI-generated reply suggestion

### Step 4: Interact with the Draft

1. **View the Draft**: The AI suggestion appears in a blue-purple gradient box
2. **Insert the Draft**: Click "Insert" to add it to your reply compose box
3. **Regenerate**: Click "Regenerate" for a different suggestion
4. **Hide/Show**: Toggle the draft visibility

### Expected AI Response

For the message "Hi, I'm interested in your product. Can you tell me more about pricing and features?", you might see:

> "Thanks for your interest! I'd be happy to walk you through our pricing and features. We offer several tiers starting at $X/month, with enterprise options available. When would be a good time for a quick call to discuss your specific needs?"

### Step 5: Verify Database Storage

1. Check your Supabase dashboard
2. Go to Table Editor → `inbox_ai_drafts`
3. You should see a record with your draft content

## Troubleshooting

### No "Generate AI Reply" Button?

- Ensure you're viewing an incoming message (not outgoing)
- Check browser console for JavaScript errors
- Verify the component is properly imported

### Draft Generation Fails?

- Check OpenAI API key in environment variables
- Verify API quota hasn't been exceeded
- Check browser network tab for failed requests

### Database Errors?

- Run `supabase db push` to apply migrations
- Check Supabase logs for detailed error messages
- Verify RLS policies are properly configured

## Advanced Testing

### Test Different Message Types

Try these test messages to see how AI handles different scenarios:

1. **Meeting Request**: "Can we schedule a call to discuss this further?"
2. **Objection**: "This seems expensive compared to alternatives"
3. **Question**: "Does this integrate with Salesforce?"
4. **Urgent**: "I need this implemented by next week"

### Test Regeneration

1. Generate a draft
2. Click "Regenerate" multiple times
3. Notice how the AI provides different variations while maintaining professionalism

### Test Insertion

1. Generate a draft
2. Click "Insert" 
3. Verify the text appears in your compose box
4. Edit the inserted text to personalize it

## Performance Notes

- **First Generation**: 2-5 seconds (API call + AI processing)
- **Subsequent Views**: Instant (cached in database)
- **Background Processing**: Non-blocking (happens automatically)

## What's Happening Behind the Scenes

1. **Message Arrival**: Email reply triggers `/api/inbound/reply`
2. **Thread Creation**: System creates/updates inbox thread
3. **Background AI**: AI draft generation happens automatically
4. **Database Storage**: Draft is saved for immediate use
5. **UI Display**: Component shows cached draft instantly

## Next Steps

After testing:

1. **Customize Prompts**: Modify AI system messages in the API
2. **Add Analytics**: Track draft usage and effectiveness
3. **Team Training**: Show the feature to your sales team
4. **Feedback Loop**: Collect input on draft quality and relevance

## Support

If you encounter issues:

1. Check the test script: `npm run tsx scripts/test-ai-drafts.ts`
2. Review the documentation: `docs/AI-DRAFT-FEATURE.md`
3. Check browser console and network tab
4. Verify all environment variables are set correctly 