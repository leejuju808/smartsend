# Block 19720 — Manual Test Cases

**Step-by-step manual test cases for Inbox QA**

## Test Environment Setup

Before running manual tests:
1. Ensure local dev server is running (`npm run dev`)
2. Ensure Supabase local instance is running (`supabase start`)
3. Have test email accounts ready (Gmail/Outlook)
4. Have test user accounts created

---

## PART 2 — Inbound Email Flow Tests

### Test Case 2.1: Perfect Reply

**Objective:** Verify reply from same email creates message and updates thread correctly.

**Steps:**
1. Log in as test owner
2. Send outbound email to `test-homeowner@example.com` via campaign
3. Wait for email to be sent (check campaign logs)
4. Reply from `test-homeowner@example.com` with:
   - Subject: "Re: [Original Subject]"
   - In-Reply-To header present
   - Body: "Yes, I am interested in getting a quote."
5. Navigate to Inbox page
6. Verify new message appears in thread list
7. Click on thread
8. Verify message appears in conversation
9. Verify thread is at top of list (most recent)
10. Verify unread badge shows
11. Check browser console for errors

**Expected Results:**
- ✅ Message appears in inbox within 30 seconds
- ✅ Thread shows unread badge
- ✅ Thread is at top of list
- ✅ Message body displays correctly
- ✅ No console errors
- ✅ Database shows new `inbox_messages` row
- ✅ Thread `last_message_at` updated

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 2.2: Reply From Different Email (Orphaned)

**Objective:** Verify orphaned reply detection and assignment flow.

**Steps:**
1. Send outbound email to `homeowner@example.com`
2. Forward email to `work@company.com`
3. Reply from `work@company.com` (no In-Reply-To match)
4. Navigate to Inbox
5. Look for "Resolve Orphaned Reply" banner or indicator
6. Click on orphaned message
7. Use assignment modal to link to correct thread
8. Verify message appears in correct thread
9. Verify orphaned indicator disappears

**Expected Results:**
- ✅ Orphaned reply detected
- ✅ Banner/modal appears
- ✅ Assignment modal works
- ✅ Thread re-linked correctly
- ✅ Message appears in correct thread

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 2.3: Missing Headers

**Objective:** Verify thread creation works when In-Reply-To header is missing.

**Steps:**
1. Send outbound email
2. Reply without In-Reply-To header
3. Include "Re:" in subject line
4. Navigate to Inbox
5. Verify message appears (subject-based matching)
6. Verify AI classification runs
7. Check thread created correctly

**Expected Results:**
- ✅ Message appears in inbox
- ✅ Thread created or matched
- ✅ AI classification runs
- ✅ No errors

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 2.4: Duplicate Webhook

**Objective:** Verify duplicate prevention works.

**Steps:**
1. Send test reply
2. Manually trigger webhook again with same message_id
3. Check database for duplicate messages
4. Verify only one message exists
5. Check logs for dedupe event

**Expected Results:**
- ✅ Only one message created
- ✅ Webhook returns dedupe flag
- ✅ Logs show dedupe event

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 2.5: Bounce Detection

**Objective:** Verify bounce emails are filtered correctly.

**Steps:**
1. Send email to invalid address (e.g., `invalid@nonexistent-domain-12345.com`)
2. Wait for bounce email
3. Check inbox for bounce message
4. Verify bounce not visible to owner
5. Check system messages/logs
6. Verify lead marked as bounced

**Expected Results:**
- ✅ Bounce not visible in inbox
- ✅ Stored in system messages
- ✅ Lead status updated
- ✅ Future sends suppressed

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 2.6: Auto-Reply Detection

**Objective:** Verify auto-reply emails are filtered correctly.

**Steps:**
1. Send email to account with auto-reply enabled
2. Wait for auto-reply
3. Check inbox for auto-reply message
4. Verify auto-reply not visible to owner
5. Check system messages
6. Verify lead not marked as replied
7. Verify sequence continues

**Expected Results:**
- ✅ Auto-reply not visible in inbox
- ✅ Stored in system messages
- ✅ Lead status unchanged
- ✅ Sequence continues

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

## PART 3 — Inbox UI Tests

### Test Case 3.1: Empty State

**Steps:**
1. Log in as new user with no threads
2. Navigate to Inbox
3. Verify empty state displays
4. Check for demo mode prompt (if applicable)
5. Verify no errors in console

**Expected Results:**
- ✅ Empty state message shows
- ✅ Demo mode prompt (if applicable)
- ✅ No console errors
- ✅ UI looks polished

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 3.2: Thread List Rendering

**Steps:**
1. Create 5 test threads (via test script or manual)
2. Navigate to Inbox
3. Verify all 5 threads visible
4. Verify correct order (newest first)
5. Verify unread badges show
6. Verify lead badges display
7. Verify timestamps formatted correctly

**Expected Results:**
- ✅ All threads visible
- ✅ Correct order
- ✅ Badges display correctly
- ✅ Timestamps formatted

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 3.3: Thread List Scrolling

**Steps:**
1. Create 50+ test threads
2. Navigate to Inbox
3. Scroll through list
4. Verify smooth scrolling
5. Verify pagination works
6. Verify "Load More" button works
7. Check performance (no lag)

**Expected Results:**
- ✅ Smooth scrolling
- ✅ Pagination works
- ✅ No performance lag
- ✅ Load more works

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 3.4: Thread Selection

**Steps:**
1. Navigate to Inbox with multiple threads
2. Click on a thread
3. Verify detail panel opens
4. Verify correct thread loaded
5. Verify active state highlights row
6. Verify URL updates with thread ID

**Expected Results:**
- ✅ Detail panel opens
- ✅ Correct thread loaded
- ✅ Active state highlights
- ✅ URL updates

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 3.5: Unread → Read State

**Steps:**
1. Navigate to Inbox with unread threads
2. Click on unread thread
3. Verify unread badge disappears
4. Verify row styling updates
5. Check database for `read_at` timestamp
6. Verify metrics bar updates

**Expected Results:**
- ✅ Badge disappears
- ✅ Styling updates
- ✅ Database updated
- ✅ Metrics updated

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 3.6: Filters

**Steps:**
1. Navigate to Inbox
2. Click "Hot" filter
3. Verify list updates instantly
4. Click "Warm" filter
5. Verify list updates
6. Use search box
7. Verify search filters correctly
8. Verify URL params update
9. Verify no full page reload

**Expected Results:**
- ✅ Filters work instantly
- ✅ Search works
- ✅ URL params update
- ✅ No page reload

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 3.7: Detail Panel - Conversation Load

**Steps:**
1. Click on thread with multiple messages
2. Verify all messages visible
3. Verify correct order (chronological)
4. Verify sender names display
5. Verify timestamps show
6. Verify HTML rendering works
7. Verify plain text fallback works

**Expected Results:**
- ✅ All messages visible
- ✅ Correct order
- ✅ Sender names show
- ✅ HTML renders correctly

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 3.8: Action Buttons - Call Now

**Steps:**
1. Click on thread
2. Click "Call Now" button
3. Verify phone dialer opens
4. Verify phone number formatted correctly
5. Check activity feed for logged action

**Expected Results:**
- ✅ Phone dialer opens
- ✅ Number formatted correctly
- ✅ Action logged

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 3.9: Action Buttons - Send Estimate Link

**Steps:**
1. Click on thread
2. Click "Send Estimate Link"
3. Verify modal opens
4. Verify link generated
5. Click "Copy Link"
6. Verify link copied to clipboard
7. Click "Send via Email"
8. Verify email sent

**Expected Results:**
- ✅ Modal opens
- ✅ Link generated
- ✅ Copy works
- ✅ Email sent

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 3.10: Action Buttons - Mark as Booked

**Steps:**
1. Click on thread
2. Click "Mark as Booked"
3. Verify status updates to "booked"
4. Verify lead status updated
5. Check activity feed for logged action
6. Verify metrics updated

**Expected Results:**
- ✅ Status updates
- ✅ Lead status updated
- ✅ Activity logged
- ✅ Metrics updated

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 3.11: Action Buttons - Add Task

**Steps:**
1. Click on thread
2. Click "Add Task"
3. Verify task modal opens
4. Fill in task details
5. Set due date
6. Click "Create Task"
7. Verify task appears in task list
8. Verify task linked to thread

**Expected Results:**
- ✅ Modal opens
- ✅ Task created
- ✅ Appears in task list
- ✅ Linked correctly

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 3.12: AI Summary Display

**Steps:**
1. Click on thread with AI classification
2. Verify AI summary panel displays
3. Verify intent badge shows (Hot/Warm/Cold)
4. Verify lead score displays (0-100)
5. Verify suggested actions visible
6. Verify reasoning text shows

**Expected Results:**
- ✅ Summary displays
- ✅ Intent badge correct
- ✅ Score displays
- ✅ Actions visible

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 3.13: Metrics Bar

**Steps:**
1. Navigate to Inbox
2. Verify metrics bar displays:
   - Total threads count
   - Hot leads count
   - Unread count
   - New replies count
3. Receive new message
4. Verify metrics update in real-time
5. Mark thread as booked
6. Verify metrics update

**Expected Results:**
- ✅ Metrics display correctly
- ✅ Updates in real-time
- ✅ Counts accurate

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 3.14: Activity Feed

**Steps:**
1. Navigate to Inbox
2. Verify activity feed shows latest actions
3. Verify correct timestamps
4. Verify action types correct
5. Verify user names show
6. Trigger new action (e.g., mark as booked)
7. Verify new event slides in
8. Click on activity event
9. Verify correct thread opens

**Expected Results:**
- ✅ Feed displays correctly
- ✅ Real-time updates work
- ✅ Clicking opens thread

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

## PART 4 — Settings & Notification Tests

### Test Case 4.1: Default Tab Setting

**Steps:**
1. Navigate to Inbox Settings
2. Select "Hot" as default tab
3. Save settings
4. Navigate away from Inbox
5. Navigate back to Inbox
6. Verify "Hot" tab is selected by default
7. Check database for saved setting

**Expected Results:**
- ✅ Tab selection persists
- ✅ Loads correct tab on page load
- ✅ Database updated

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 4.2: Quiet Hours

**Steps:**
1. Navigate to Inbox Settings
2. Set quiet hours: 22:00 - 07:00
3. Save settings
4. Simulate message received during quiet hours (22:30)
5. Verify notification queued (not sent)
6. Simulate message received after quiet hours (08:00)
7. Verify notification sent immediately
8. Check database for saved quiet hours

**Expected Results:**
- ✅ Quiet hours saved
- ✅ Notifications queued during quiet hours
- ✅ Notifications sent after quiet hours
- ✅ Database updated correctly

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 4.3: Notification Toggles

**Steps:**
1. Navigate to Inbox Settings
2. Toggle "Notify for Hot Leads" OFF
3. Toggle "Notify for Warm Leads" ON
4. Save settings
5. Simulate hot lead message
6. Verify no notification sent
7. Simulate warm lead message
8. Verify notification sent
9. Check database for saved toggles

**Expected Results:**
- ✅ Toggles save correctly
- ✅ Notifications respect settings
- ✅ Database updated

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 4.4: Lead Priority Weights

**Steps:**
1. Navigate to Inbox Settings
2. Set Hot weight: 100
3. Set Warm weight: 70
4. Set Follow-up weight: 50
5. Save settings
6. Verify weights saved
7. Try to set weight > 100
8. Verify validation prevents invalid value
9. Check database for saved weights

**Expected Results:**
- ✅ Weights save correctly
- ✅ Validation works
- ✅ Database updated

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

## PART 5 — Load & Stress Tests

### Test Case 5.1: Thread List Performance

**Steps:**
1. Create 1,000 test threads (via script)
2. Navigate to Inbox
3. Measure initial load time (should be < 300ms)
4. Click filter (measure filter time)
5. Use search (measure search time)
6. Scroll through list
7. Verify smooth scrolling
8. Check browser performance tab

**Expected Results:**
- ✅ Load time < 300ms
- ✅ Filter time < 100ms
- ✅ Search time < 200ms
- ✅ Smooth scrolling
- ✅ No performance lag

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 5.2: Detail Panel Performance

**Steps:**
1. Create thread with 100 messages
2. Navigate to Inbox
3. Click on thread
4. Measure detail panel load time (should be < 200ms)
5. Scroll through messages
6. Verify smooth scrolling
7. Check browser performance tab

**Expected Results:**
- ✅ Load time < 200ms
- ✅ Smooth scrolling
- ✅ No performance lag

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 5.3: Real-Time Updates

**Steps:**
1. Open Inbox in browser
2. Send 10 test replies rapidly
3. Verify each appears in real-time
4. Measure update latency (should be < 100ms)
5. Verify no duplicate updates
6. Verify no message loss

**Expected Results:**
- ✅ Updates appear in real-time
- ✅ Latency < 100ms
- ✅ No duplicates
- ✅ No message loss

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 5.4: AI Queue Performance

**Steps:**
1. Send 50 test replies rapidly
2. Monitor AI classification queue
3. Verify queue clears within 1-3 minutes
4. Verify no backlog accumulation
5. Check worker logs for errors

**Expected Results:**
- ✅ Queue clears within 1-3 minutes
- ✅ No backlog
- ✅ No errors

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

## PART 6 — Cross-Browser & Mobile Tests

### Test Case 6.1: Chrome Desktop

**Steps:**
1. Open Inbox in Chrome (desktop)
2. Test all major flows
3. Verify UI renders correctly
4. Check console for errors

**Expected Results:**
- ✅ All features work
- ✅ UI renders correctly
- ✅ No console errors

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 6.2: Safari Desktop

**Steps:**
1. Open Inbox in Safari (desktop)
2. Test all major flows
3. Verify UI renders correctly
4. Check console for errors

**Expected Results:**
- ✅ All features work
- ✅ UI renders correctly
- ✅ No console errors

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 6.3: Mobile Safari

**Steps:**
1. Open Inbox on iPhone (Safari)
2. Test all major flows
3. Verify responsive design works
4. Test touch interactions
5. Check console for errors

**Expected Results:**
- ✅ Responsive design works
- ✅ Touch interactions work
- ✅ No console errors

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case 6.4: Mobile Chrome

**Steps:**
1. Open Inbox on Android (Chrome)
2. Test all major flows
3. Verify responsive design works
4. Test touch interactions
5. Check console for errors

**Expected Results:**
- ✅ Responsive design works
- ✅ Touch interactions work
- ✅ No console errors

**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

## Test Execution Log

**Tester Name:** _________________

**Date Started:** _________________

**Date Completed:** _________________

**Total Test Cases:** 30+

**Passed:** ___

**Failed:** ___

**Blocked:** ___

**Notes:**



















































