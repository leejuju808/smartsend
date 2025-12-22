# Block 19720 — Owner Inbox Testing Matrix & QA Checklist v1

**Every Feature, Every Flow, Every Edge Case — Fully Verified Before We Ship**

## 🔥 WHAT WE'RE BUILDING IN THIS BLOCK

The Inbox is now feature-complete and polished. This block ensures it's bulletproof before release.

We're creating:
- A full QA test plan
- Manual test cases
- Automated test coverage goals
- Integration tests for email → webhook → DB → UI
- Stress tests for high-volume lead scenarios
- A checklist owners must NEVER hit bugs on

This block guarantees the Inbox works even for a roofing company with thousands of leads, multiple users, and constant activity.

This is how SmartSend becomes elite infrastructure, not guessing.

---

## 🧱 PART 1 — Test Environments

We must test in 3 environments:

1. **Local dev** (Cursor, hot reload)
   - Fast iteration
   - Real-time debugging
   - Schema validation

2. **Staging** (with real email webhooks)
   - Real Gmail/Outlook webhooks
   - Production-like data volumes
   - Integration verification

3. **Production shadow mode** (mirror but no owner access)
   - Real traffic mirroring
   - Performance validation
   - Zero user impact

### Environment Setup Requirements

Each environment must run:
- ✅ Same schema (`supabase/migrations/`)
- ✅ Same API routes (`app/api/inbox/`)
- ✅ Same webhook handling (`supabase/functions/webhook-*/`)
- ✅ Same AI classification worker (`supabase/functions/inbox-ai-classifier-worker/`)

This gives clean test confidence.

### Environment Configuration

```bash
# Local Dev
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=local_anon_key
SUPABASE_SERVICE_ROLE_KEY=local_service_key

# Staging
NEXT_PUBLIC_SUPABASE_URL=https://staging.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=staging_anon_key
SUPABASE_SERVICE_ROLE_KEY=staging_service_key

# Production Shadow
NEXT_PUBLIC_SUPABASE_URL=https://prod.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=prod_anon_key
SUPABASE_SERVICE_ROLE_KEY=prod_service_key
```

---

## 🧱 PART 2 — Inbound Email → Thread Creation Flow Tests

We create a test matrix for the full inbound process.

### Case 1 — Perfect Reply

**Setup:**
- Send reply from same email
- Same thread ID
- Valid In-Reply-To header

**Expected:**
- ✅ `inbox_messages` row created
- ✅ Thread bumped to top
- ✅ AI intent + score applied
- ✅ UI updates in real-time
- ✅ `last_message_at` updated
- ✅ `unread_count` incremented

**Test Steps:**
1. Send outbound email to `homeowner@example.com`
2. Wait for thread creation
3. Reply from `homeowner@example.com` with In-Reply-To header
4. Verify webhook receives payload
5. Check database for new message
6. Verify thread updated_at timestamp
7. Check UI refreshes automatically

### Case 2 — Reply From Different Email

**Setup:**
- Owner sends to `homeowner@example.com`
- Homeowner forwards to their "work" address (`work@company.com`)
- Replies from work address

**Expected:**
- ✅ Orphaned detection triggered
- ✅ "Resolve Orphaned Reply" banner appears
- ✅ Assign via modal works
- ✅ Thread re-linked correctly
- ✅ Message appears in correct thread

**Test Steps:**
1. Send outbound to `homeowner@example.com`
2. Forward email to `work@company.com`
3. Reply from `work@company.com` (no In-Reply-To match)
4. Verify orphaned detection logic
5. Test assignment modal
6. Verify thread re-linking
7. Check message appears in correct thread

### Case 3 — Missing Headers

**Setup:**
- Email client strips In-Reply-To header
- Only subject line matches (e.g., "Re: Your Roof Estimate")

**Expected:**
- ✅ New thread creation logic works
- ✅ Thread still created
- ✅ AI kicks in normally
- ✅ Subject-based matching works

**Test Steps:**
1. Send outbound email
2. Reply without In-Reply-To header
3. Include "Re:" in subject
4. Verify thread matching by subject
5. Verify AI classification runs
6. Check message appears correctly

### Case 4 — Duplicate Webhook

**Setup:**
- Resend inbound event twice (same message_id)
- Simulate webhook retry

**Expected:**
- ✅ Duplicate prevented
- ✅ 1 message created (not 2)
- ✅ 1 log entry in `inbound_email_logs`
- ✅ Webhook returns 200 OK with dedupe flag

**Test Steps:**
1. Send inbound webhook with message_id="test-123"
2. Verify message created
3. Resend same webhook payload
4. Verify no duplicate message
5. Check logs show dedupe event
6. Verify webhook response indicates dedupe

### Case 5 — Bounce

**Setup:**
- Send simulated bounce email
- Include bounce headers/patterns

**Expected:**
- ✅ Filter out automatically
- ✅ Stored under system messages
- ✅ Never shown to owner
- ✅ Lead marked as bounced
- ✅ Future sends suppressed

**Test Steps:**
1. Send bounce email with bounce headers
2. Verify bounce detection logic
3. Check message stored in system bucket
4. Verify not visible in inbox UI
5. Check lead status updated
6. Verify suppression list updated

### Case 6 — Auto-reply

**Setup:**
- "Out of Office" email
- Vacation responder
- Auto-responder patterns

**Expected:**
- ✅ Filter logic catches it
- ✅ No notification sent
- ✅ Stored in system bucket
- ✅ Lead not marked as replied
- ✅ Sequence continues

**Test Steps:**
1. Send OOO email with auto-reply patterns
2. Verify auto-reply detection
3. Check no notification sent
4. Verify stored in system messages
5. Check lead status unchanged
6. Verify sequence continues

---

## 🧱 PART 3 — Inbox UI Tests (Manual + Automated)

### Thread List Tests

#### Load 0 rows → clean empty state
- ✅ Empty state message displays
- ✅ Demo mode prompt (if applicable)
- ✅ No errors in console
- ✅ Smooth loading animation

#### Load 5 rows → correct rendering
- ✅ All 5 threads visible
- ✅ Correct order (newest first)
- ✅ Unread badges show correctly
- ✅ Lead badges display
- ✅ Timestamps formatted correctly

#### Load 50 rows → smooth scroll
- ✅ Virtual scrolling works
- ✅ No performance lag
- ✅ Pagination loads correctly
- ✅ Scroll position maintained
- ✅ Load more button works

#### Clicking row switches detail view
- ✅ Detail panel opens
- ✅ Correct thread loaded
- ✅ Active state highlights row
- ✅ URL updates with thread ID

#### Unread → read state changes on click
- ✅ Unread badge disappears
- ✅ Row styling updates
- ✅ Database updated (`read_at` set)
- ✅ Metrics bar updates

#### Filters update list instantly
- ✅ Filter by intent (hot/warm/follow_up)
- ✅ Filter by status (all/new_replies/snoozed)
- ✅ Search filters correctly
- ✅ URL params update
- ✅ No full page reload

### Detail Panel Tests

#### Full conversation loads
- ✅ All messages in thread visible
- ✅ Correct order (chronological)
- ✅ Sender names display
- ✅ Timestamps show
- ✅ HTML rendering works
- ✅ Plain text fallback works

#### Action buttons work

**Call Now:**
- ✅ Opens phone dialer
- ✅ Phone number formatted correctly
- ✅ Logs action in activity feed

**Send Estimate Link:**
- ✅ Modal opens
- ✅ Link generated correctly
- ✅ Copy to clipboard works
- ✅ Link sent via email

**Mark as Booked:**
- ✅ Status updates to "booked"
- ✅ Lead status updated
- ✅ Activity logged
- ✅ Metrics updated

**Add Task:**
- ✅ Task modal opens
- ✅ Task created correctly
- ✅ Task appears in task list
- ✅ Due date set correctly

**Add to CRM:**
- ✅ CRM modal opens
- ✅ Integration works (HubSpot/Salesforce)
- ✅ Data synced correctly

#### AI Summary displayed
- ✅ Summary loads correctly
- ✅ Intent badge shows
- ✅ Lead score displays
- ✅ Suggested actions visible
- ✅ Reasoning text shows

#### Lead badges consistent
- ✅ Hot/Warm/Cold badges correct
- ✅ Colors match intent
- ✅ Badges update on AI re-classification

#### Lead score correct
- ✅ Score displays (0-100)
- ✅ Score updates when new data arrives
- ✅ Score calculation matches backend

### Metrics Bar Tests

#### Renders correct counts
- ✅ Total threads count
- ✅ Hot leads count
- ✅ Unread count
- ✅ New replies count

#### Updates on:
- ✅ New message received
- ✅ New booking created
- ✅ Filter changes
- ✅ Real-time updates work

### Activity Feed Tests

#### Shows latest actions
- ✅ Recent actions visible
- ✅ Correct timestamps
- ✅ Action types correct
- ✅ User names show

#### New event slides in
- ✅ Animation smooth
- ✅ Real-time updates work
- ✅ No duplicate entries

#### Clicking event opens correct thread
- ✅ Thread detail opens
- ✅ Correct thread selected
- ✅ Scrolls to relevant message

---

## 🧱 PART 4 — Settings & Notification Tests

### Settings Panel Tests

#### Default tab saved correctly
- ✅ Tab selection persists
- ✅ Loads correct tab on page load
- ✅ Database updated (`inbox_settings.default_tab`)

#### Quiet hours stored properly
- ✅ Start time saved
- ✅ End time saved
- ✅ Handles midnight crossover (e.g., 8pm-6am)
- ✅ Database updated correctly

#### Notifications toggles update DB
- ✅ Hot leads toggle saves
- ✅ Warm leads toggle saves
- ✅ Follow-up toggle saves
- ✅ Booked toggle saves
- ✅ Database reflects changes

#### Lead weighting stored correctly
- ✅ Hot weight saved (0-100)
- ✅ Warm weight saved (0-100)
- ✅ Follow-up weight saved (0-100)
- ✅ Validation prevents invalid values

### Notification Delivery Tests

#### Simulate inbound message with Hot intent
- ✅ Push notification sent (if enabled)
- ✅ Quiet hours respected
- ✅ Banner appears in UI
- ✅ Notification logged

#### Simulate inbound message with Warm intent
- ✅ Push notification sent (if enabled)
- ✅ Quiet hours respected
- ✅ Banner appears in UI

#### Simulate inbound message with Follow-up intent
- ✅ Push notification sent (if enabled)
- ✅ Quiet hours respected
- ✅ Banner appears in UI

#### Quiet-hours hold works
- ✅ Message received during quiet hours
- ✅ Notification queued (not sent)
- ✅ Notification sent after quiet hours end
- ✅ Banner appears immediately (not delayed)

---

## 🧱 PART 5 — Load & Stress Testing

We must ensure performance holds under real roofing volume.

### Simulate:
- ✅ 1,000 threads
- ✅ 5,000 messages
- ✅ 50 new replies in 1 hour
- ✅ 10 concurrent users
- ✅ Multiple campaigns active

### Test Performance Metrics:

#### Thread list loads in < 300 ms
- ✅ Initial load time
- ✅ Filter change time
- ✅ Search response time
- ✅ Pagination load time

#### Detail panel loads in < 200 ms
- ✅ Thread detail load
- ✅ Message rendering
- ✅ AI summary load
- ✅ Action buttons render

#### Real-time updates don't lag
- ✅ WebSocket connection stable
- ✅ Update latency < 100ms
- ✅ No message loss
- ✅ No duplicate updates

#### Pagination remains smooth
- ✅ Load more works at scale
- ✅ Cursor pagination efficient
- ✅ No memory leaks
- ✅ Smooth scrolling

#### CPU spikes < 70%
- ✅ Server CPU usage
- ✅ Client CPU usage
- ✅ Database CPU usage
- ✅ No performance degradation

#### AI queue clears within 1–3 minutes
- ✅ Queue processing time
- ✅ No backlog accumulation
- ✅ Worker scaling works
- ✅ Error handling works

---

## 🧱 PART 6 — AI Accuracy Tests

We run 30–50 AI evaluation test cases:

### Categories:

#### Storm damage
- ✅ "My roof was damaged in the storm last week"
- ✅ Expected: HOT intent, score 80-100
- ✅ Tags: ["storm", "damage", "urgent"]

#### Active leaking
- ✅ "Water is coming through my ceiling right now"
- ✅ Expected: HOT intent, score 90-100
- ✅ Tags: ["leak", "urgent", "emergency"]

#### Insurance claim
- ✅ "I filed an insurance claim, when can you inspect?"
- ✅ Expected: HOT intent, score 85-95
- ✅ Tags: ["insurance", "claim", "inspection"]

#### Inspection request
- ✅ "Can someone come out to look at my roof?"
- ✅ Expected: HOT intent, score 75-90
- ✅ Tags: ["inspection", "appointment"]

#### Price shopping
- ✅ "What would a new roof cost?"
- ✅ Expected: WARM intent, score 50-70
- ✅ Tags: ["pricing", "quote"]

#### Dead lead
- ✅ "Not interested, please remove me"
- ✅ Expected: NOT_INTERESTED intent, score 0-20
- ✅ Tags: ["unsubscribe"]

#### "What's the price?"
- ✅ "How much does this cost?"
- ✅ Expected: WARM intent, score 50-65
- ✅ Tags: ["pricing"]

#### "Not interested"
- ✅ "We're not interested at this time"
- ✅ Expected: NOT_INTERESTED intent, score 10-30
- ✅ Tags: ["not_interested"]

#### Ghosting follow-up
- ✅ "Sorry for the delay, still interested"
- ✅ Expected: WARM intent, score 40-60
- ✅ Tags: ["follow_up"]

#### Text with partial info
- ✅ "Hi, I saw your email about roofing"
- ✅ Expected: FOLLOW_UP intent, score 30-50
- ✅ Tags: ["needs_follow_up"]

#### Confusing messages
- ✅ "Maybe, not sure, let me think"
- ✅ Expected: FOLLOW_UP intent, score 20-40
- ✅ Tags: ["unclear"]

#### Multi-paragraph emails
- ✅ Long email with multiple topics
- ✅ Expected: Correct intent extraction
- ✅ Tags: Multiple relevant tags

#### Multi-language replies
- ✅ Spanish reply: "Necesito una cotización"
- ✅ Expected: HOT intent (translation works)
- ✅ Tags: ["quote", "spanish"]

### Test Execution:

For each test case:
1. Send test email with known content
2. Wait for AI classification
3. Verify intent matches expected
4. Verify score within expected range
5. Verify tags include expected keywords
6. Log results for accuracy tracking

---

## 🧱 PART 7 — Regression Testing

Whenever we make changes, inbox core functions must re-pass.

### No regressions in:

#### Sorting
- ✅ Newest first (default)
- ✅ Oldest first
- ✅ By lead score
- ✅ By unread status

#### Filtering
- ✅ By intent (hot/warm/cold/follow_up)
- ✅ By status (all/new_replies/snoozed)
- ✅ By campaign
- ✅ By date range
- ✅ Search functionality

#### AI tagging
- ✅ Intent classification
- ✅ Lead score calculation
- ✅ Tag extraction
- ✅ Summary generation

#### Real-time updates
- ✅ WebSocket connection
- ✅ Message updates
- ✅ Thread updates
- ✅ Metrics updates

#### Action buttons
- ✅ Call Now
- ✅ Send Estimate Link
- ✅ Mark as Booked
- ✅ Add Task
- ✅ Add to CRM

#### Thread creation
- ✅ Perfect reply flow
- ✅ Orphaned reply handling
- ✅ Missing headers handling
- ✅ Duplicate prevention

### Automated Test Coverage:

We add simple automated tests for:
- ✅ Webhook handling (`tests/inbox-webhook.test.ts`)
- ✅ DB insertions (`tests/inbox-db.test.ts`)
- ✅ Intent classification (`tests/inbox-ai.test.ts`)
- ✅ Settings save/load (`tests/inbox-settings.test.ts`)

---

## 🧱 PART 8 — QA Checklist (Zero-Bug Launch Guarantee)

Before Inbox goes live, all checkboxes must be green:

### Core Functionality
- [ ] Replies flow correctly
- [ ] Threads never merge incorrectly
- [ ] No orphan stays unresolved
- [ ] No duplicate inserts
- [ ] Bounces filtered
- [ ] Auto-replies filtered

### Performance
- [ ] UI fast at 1k+ threads
- [ ] Metrics correct
- [ ] Activity feed stable
- [ ] Real-time updates work

### Actions & Integrations
- [ ] Action buttons log correctly
- [ ] Booked jobs recorded
- [ ] CRM integrations work
- [ ] Task creation works

### AI & Classification
- [ ] AI intent correct on test set
- [ ] Lead scores accurate
- [ ] Tags extracted correctly
- [ ] Summaries generated

### Notifications & Settings
- [ ] Notifications respect settings
- [ ] Quiet hours work
- [ ] Default tab saves
- [ ] Lead weights save

### User Experience
- [ ] Inbox feels premium
- [ ] No console errors
- [ ] Works on mobile
- [ ] Works for users with small screens
- [ ] Works for multiple team members
- [ ] Tour triggers correctly
- [ ] Demo mode works

### Quality Assurance
- [ ] No broken links
- [ ] Excellent empty states
- [ ] No malformed HTML
- [ ] DB indexes tuned
- [ ] Error handling graceful
- [ ] Loading states smooth

When all are passed → Inbox is ready for beta.

---

## 📌 SUMMARY — HOW THIS HELPS ROOFING COMPANIES

This block ensures roofing companies:

- ✅ **Never lose a lead** — Every reply captured and threaded correctly
- ✅ **Never get bad data** — AI classification accurate, duplicates prevented
- ✅ **Never see a glitch** — Performance tested, UI polished
- ✅ **Never question SmartSend's reliability** — Comprehensive testing builds trust

It builds trust, which is the #1 factor in:
- ✅ Paying
- ✅ Retaining
- ✅ Referring
- ✅ Expanding into Growth or Domination Plan

---

## Test Execution Schedule

1. **Week 1:** Set up test environments, run manual test cases
2. **Week 2:** Execute automated tests, AI accuracy tests
3. **Week 3:** Load/stress testing, performance optimization
4. **Week 4:** Regression testing, final QA checklist, bug fixes
5. **Week 5:** Beta release to select customers

---

## Test Results Tracking

Track all test results in:
- `docs/BLOCK_19720_TEST_RESULTS.md` — Detailed test results
- `docs/BLOCK_19720_QA_CHECKLIST.md` — Checklist status
- `docs/BLOCK_19720_AI_ACCURACY.md` — AI classification accuracy

---

## Next Steps

1. Review and approve this test plan
2. Set up test environments
3. Begin executing test cases
4. Track results and fix issues
5. Complete QA checklist
6. Launch beta



















































