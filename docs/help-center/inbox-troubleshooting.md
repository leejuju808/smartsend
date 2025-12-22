# Inbox Troubleshooting

Common issues and how to fix them.

## Orphaned Replies

### What are orphaned replies?
Replies that SmartSend can't automatically match to a contact or campaign.

### Why does this happen?
- Homeowner replied from a different email address
- Email threading broke
- Campaign was deleted
- Contact was merged or deleted

### How to fix it:
1. Click on the orphaned reply
2. Click "Resolve Orphaned Reply"
3. Select the correct contact from the list
4. Select the correct campaign
5. Click "Match"

SmartSend will link the reply to the correct contact and campaign.

---

## Mis-Threaded Messages

### What is mis-threading?
Messages appearing in the wrong conversation thread.

### Why does this happen?
- Email headers are incorrect
- Multiple email addresses for same contact
- Reply-to address mismatch

### How to fix it:
1. Open the mis-threaded message
2. Click "Move to Correct Thread"
3. Select the correct contact/thread
4. Confirm the move

---

## Quiet Hours Not Working

### Issue: Still getting notifications during quiet hours

### How to fix:
1. Go to **Inbox Settings** (gear icon)
2. Check **Quiet Hours** section
3. Verify start and end times are correct
4. Make sure timezone is set correctly in your account
5. Save settings

**Note**: Quiet hours only delay push notifications. Replies still appear in the Inbox.

---

## Notification Fixes

### Not getting notifications for new hot leads

**Check**:
1. Go to **Inbox Settings**
2. Verify "New Hot Lead Alerts" is ON
3. Check browser notification permissions
4. Check phone notification settings (if using mobile app)

**Fix**:
- Enable browser notifications in your browser settings
- Enable push notifications in SmartSend settings
- Check "Do Not Disturb" mode isn't blocking notifications

---

### Getting too many notifications

**Fix**:
1. Go to **Inbox Settings**
2. Turn OFF notifications you don't need:
   - Warm Lead Alerts (if you only want hot leads)
   - Follow-Up Required Alerts (if you check inbox regularly)
3. Set Quiet Hours to reduce nighttime notifications

---

## How to Verify Your Inbound Email Setup

### Check if replies are being captured:

1. **Send a test email** from your personal email to your SmartSend campaign email
2. **Check the Inbox** — reply should appear within 1-2 minutes
3. **Check Activity Feed** — should show "Reply received"

### If replies aren't appearing:

1. **Check email forwarding**:
   - Go to your email provider (Gmail, Outlook, etc.)
   - Verify forwarding is set up to SmartSend
   - Check forwarding address is correct

2. **Check SmartSend email settings**:
   - Go to **Settings** → **Email**
   - Verify inbound email address is correct
   - Check webhook is active

3. **Check spam folder**:
   - Sometimes replies get caught in spam
   - Mark as "Not Spam" if found

4. **Contact Support**:
   - If still not working, contact SmartSend support
   - Provide:
     - Your email provider
     - Campaign email address
     - Screenshot of forwarding settings

---

## Lead Score Not Updating

### Issue: Lead score stuck or not changing

### How to fix:
1. **Wait a few minutes** — AI classification can take 1-2 minutes
2. **Refresh the page** — Scores update in real-time
3. **Check AI classification** — Go to lead detail, check "AI Summary" section
4. **Manual refresh** — Click refresh button in Inbox

If still not updating:
- Contact support with lead ID
- Provide screenshot of lead detail page

---

## Filters Not Working

### Issue: Filters not showing correct results

### How to fix:
1. **Clear filters** — Click "Clear All Filters"
2. **Refresh page** — Sometimes filters need a refresh
3. **Check filter logic**:
   - "Hot" filter shows only HOT leads (80-100 score)
   - "Warm" filter shows WARM leads (60-79 score)
   - "All" shows everything

4. **Check date range** — Make sure date filter isn't excluding results

---

## Activity Feed Not Showing Actions

### Issue: Actions taken but not appearing in Activity Feed

### How to fix:
1. **Wait a few seconds** — Activity Feed updates in real-time
2. **Refresh page** — Sometimes needs manual refresh
3. **Check lead detail** — Actions are logged per lead
4. **Check filters** — Make sure Activity Feed isn't filtered

---

## Mobile Inbox Issues

### Issue: Inbox not working well on mobile

### Current status:
- Inbox is optimized for desktop
- Mobile view is basic but functional
- Full mobile app coming soon

### Workarounds:
- Use desktop browser on mobile (request desktop site)
- Use mobile browser in landscape mode
- Wait for mobile app release

---

## Still Need Help?

- Check [How the Inbox Works](./inbox-how-it-works.md)
- Check [Understanding Lead Scores](./inbox-lead-scores.md)
- Check [Actions You Can Take](./inbox-actions.md)
- Contact SmartSend support: support@smartsend.ai



















































