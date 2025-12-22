# Inbox Beta Onboarding Guide

**Block 19750 — Onboarding Flow for Beta Testers**

This guide provides a repeatable script for onboarding beta testers to the SmartSend Inbox feature.

---

## Overview

The onboarding process ensures every beta tester:
- Understands how the inbox works
- Has their email sending properly configured
- Sees the inbox in action with test messages
- Feels confident using it for real campaigns

**Duration:** 15-30 minutes per tester

---

## Pre-Onboarding Checklist

Before scheduling an onboarding call, ensure:

- [ ] User is enrolled in beta phase (via `/api/internal/inbox-monitor/enroll`)
- [ ] User has a workspace set up
- [ ] User has at least one campaign created (or is ready to create one)
- [ ] You have access to their account for troubleshooting

---

## Onboarding Script

### Step 1: Schedule 15-Minute Onboarding Call

**Email Template:**

```
Subject: Welcome to SmartSend Inbox Beta! 🎉

Hi [Name],

You've been selected for early access to SmartSend Inbox — our unified inbox system for managing all homeowner replies.

I'd like to schedule a quick 15-minute call to walk you through:
- How the inbox works
- Lead scoring and AI classification
- Demo mode and actions
- Booking jobs from the inbox

Available times:
- [Option 1]
- [Option 2]
- [Option 3]

Let me know what works best!

Best,
[Your Name]
```

---

### Step 2: Walk Through Inbox (5 minutes)

**Talking Points:**

1. **What is the Inbox?**
   - "The Inbox is where ALL homeowner replies appear, regardless of which campaign they replied to"
   - "No more switching between Gmail tabs or checking multiple inboxes"
   - "Everything is in one place, automatically organized"

2. **Show the Inbox UI:**
   - Open `/inbox` in their account
   - Point out the thread list (left panel)
   - Show thread detail view (middle panel)
   - Explain lead info panel (right panel)

3. **Explain Lead Scoring:**
   - "Every reply gets a lead score from 0-100"
   - "80-100 = HOT — Book estimate NOW"
   - "60-79 = WARM — Follow up this week"
   - "40-59 = COLD — Low priority"
   - "0-39 = Not interested"

4. **Show AI Classification:**
   - Point out intent tags (Hot Lead, Warm Lead, Follow-Up Needed, Not Interested)
   - Explain AI summary shows what homeowner wants

---

### Step 3: Connect Sending Email (5-10 minutes)

**This is critical — guide them through DNS setup:**

1. **Check Current Setup:**
   - Go to Settings → Email
   - Check if they have a sending domain configured
   - If not, help them add one

2. **DNS Configuration:**
   - Walk through SPF record setup
   - Walk through DKIM setup
   - Verify records are correct

3. **Test Sending:**
   - Send a test email from their account
   - Verify it arrives and shows correct "From" address
   - Check SPF/DKIM pass in email headers

**Common Issues:**
- DNS records not propagated (wait 5-10 minutes)
- Wrong TXT record format (show correct format)
- Domain not verified (check verification status)

---

### Step 4: Send Test Messages (3-5 minutes)

**Simulate 3-5 homeowner replies so they SEE the inbox work:**

1. **Create Test Contacts:**
   - Add 3-5 fake homeowner contacts
   - Use emails you control (or test email addresses)

2. **Send Test Campaign:**
   - Create a simple test campaign
   - Send to these test contacts
   - Use a subject like "Test: Roof Inspection"

3. **Simulate Replies:**
   - Reply to the test emails from the test contact emails
   - Use different reply types:
     - One "hot" reply: "Yes, I need an estimate ASAP!"
     - One "warm" reply: "Maybe interested, what's the price?"
     - One "cold" reply: "Not interested right now"

4. **Show Inbox in Action:**
   - Refresh inbox — replies should appear
   - Show how lead scores are assigned
   - Show how AI classifies intent
   - Demonstrate filtering and search

---

### Step 5: Activate First Real Campaign (5 minutes)

**Help them launch their first real campaign:**

1. **Choose List:**
   - Help them select a list (or create one)
   - Recommend starting with 50-100 contacts for testing

2. **Personalize Opener:**
   - Review their campaign opener
   - Suggest improvements if needed
   - Ensure it's personalized and relevant

3. **Set Sending Volume:**
   - Start conservative: 10-20 emails/day
   - Explain warmup ramp (if applicable)
   - Set expectations for delivery timing

4. **Hit "Send":**
   - Walk through the send confirmation
   - Explain what happens next
   - Set expectations for when replies will arrive

---

### Step 6: Watch Live Usage (Ongoing)

**Monitor their usage for first few days:**

1. **Check Inbox Monitor:**
   - Use `/internal/inbox-monitor` to watch their activity
   - Verify replies are being captured
   - Check for any failures or issues

2. **Daily Check-In (First Week):**
   - Day 1: "How did it go? Any questions?"
   - Day 3: "Are replies showing up correctly?"
   - Day 7: "How's the inbox working for you?"

3. **Capture Feedback:**
   - What's confusing?
   - What's missing?
   - What would make it better?

---

## Post-Onboarding Actions

### Immediate (Within 24 hours):

1. **Mark Onboarding Complete:**
   ```sql
   UPDATE inbox_rollout_tracking
   SET onboarding_completed_at = NOW()
   WHERE user_id = '[user_id]';
   ```

2. **Send Follow-Up Email:**
   - Thank them for their time
   - Provide links to help docs
   - Offer to answer questions

3. **Monitor First Replies:**
   - Watch for their first real reply
   - Verify it appears in inbox correctly
   - Check AI classification accuracy

### First Week:

1. **Track Metrics:**
   - Monitor `inbox_rollout_metrics` table
   - Check reply capture rate
   - Watch for any failures

2. **Collect Sentiment:**
   - Ask: "On a scale of 1-5, how would you rate the inbox?"
   - Update `sentiment_score` in metrics table
   - Capture any feedback in `sentiment_notes`

3. **Identify Issues:**
   - Log any bugs or confusion points
   - Create issues in `inbox_rollout_issues` table
   - Prioritize fixes

---

## Troubleshooting Common Issues

### Issue: Inbox Not Showing

**Check:**
- Is `inbox_enabled = true` in profiles table?
- Is `beta_access_level` set correctly?
- Does user have proper role permissions?

**Fix:**
```sql
SELECT enroll_inbox_beta('[user_id]', 'beta', '[your_user_id]', 'Onboarding');
```

### Issue: Replies Not Appearing

**Check:**
- Is webhook configured correctly?
- Are replies being received?
- Check `inbox_inbound_events` table for errors

**Fix:**
- Verify webhook endpoint is active
- Check email provider settings
- Review error logs

### Issue: DNS Not Working

**Check:**
- Are DNS records correct?
- Have they propagated? (can take up to 48 hours)
- Is domain verified?

**Fix:**
- Use DNS checker tool
- Verify TXT record format
- Wait for propagation

---

## Success Metrics

Track these during onboarding:

- ✅ Onboarding call completed
- ✅ Email sending configured
- ✅ Test messages received
- ✅ First real campaign sent
- ✅ First real reply captured
- ✅ User opened inbox at least once
- ✅ User responded to at least one reply

---

## Quick Reference

### Enroll User in Beta:
```bash
POST /api/internal/inbox-monitor/enroll
{
  "userId": "uuid",
  "phase": "beta",  // or "alpha", "founders", "internal"
  "notes": "Optional notes"
}
```

### Check User Access:
```sql
SELECT has_inbox_access('[user_id]');
```

### View User Metrics:
```sql
SELECT * FROM v_inbox_rollout_user_summary
WHERE user_id = '[user_id]';
```

---

## Questions?

If you encounter issues during onboarding:

1. Check `/internal/inbox-monitor` for system status
2. Review `inbox_rollout_issues` table for known issues
3. Check `inbox_inbound_events` for error logs
4. Contact [support contact] for help

---

**Last Updated:** [Date]
**Version:** 1.0



















































