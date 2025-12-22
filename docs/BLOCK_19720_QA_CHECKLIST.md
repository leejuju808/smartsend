# Block 19720 — QA Checklist (Zero-Bug Launch Guarantee)

**Before Inbox goes live, all checkboxes must be green.**

**Last Updated:** _________________

**Status:** ☐ In Progress ☐ Ready for Beta ☐ Approved for Production

---

## Core Functionality

### Email Flow
- [ ] Replies flow correctly
- [ ] Threads never merge incorrectly
- [ ] No orphan stays unresolved
- [ ] No duplicate inserts
- [ ] Bounces filtered correctly
- [ ] Auto-replies filtered correctly
- [ ] Missing headers handled gracefully
- [ ] Different email replies detected as orphaned

### Thread Management
- [ ] Thread creation works for all scenarios
- [ ] Thread updates correctly on new message
- [ ] Thread sorting works (newest first, oldest first, by score)
- [ ] Thread filtering works (hot/warm/cold/follow_up)
- [ ] Thread search works (name, email, message snippet)
- [ ] Thread pagination works smoothly
- [ ] Thread detail loads correctly

### Message Handling
- [ ] Messages display correctly (HTML and plain text)
- [ ] Message timestamps accurate
- [ ] Message sender names display
- [ ] Message order correct (chronological)
- [ ] Message attachments display (if applicable)
- [ ] Message links work correctly

---

## Performance

### Load Performance
- [ ] UI fast at 1k+ threads (< 300ms load)
- [ ] Detail panel loads quickly (< 200ms)
- [ ] Real-time updates don't lag (< 100ms latency)
- [ ] Pagination remains smooth
- [ ] Search responds quickly (< 200ms)
- [ ] Filter changes instant (< 100ms)

### Stress Performance
- [ ] Handles 1,000 threads without lag
- [ ] Handles 5,000 messages without lag
- [ ] Handles 50 new replies in 1 hour
- [ ] Handles 10 concurrent users
- [ ] CPU spikes < 70%
- [ ] Memory usage stable (no leaks)
- [ ] Database queries optimized

### AI Queue Performance
- [ ] AI queue clears within 1–3 minutes
- [ ] No backlog accumulation
- [ ] Worker scaling works
- [ ] Error handling works
- [ ] Failed classifications retry correctly

---

## Metrics & Data Accuracy

### Metrics Bar
- [ ] Metrics render correct counts
- [ ] Updates on new message
- [ ] Updates on new booking
- [ ] Updates on filter changes
- [ ] Real-time updates work
- [ ] No stale data

### Activity Feed
- [ ] Shows latest actions
- [ ] Correct timestamps
- [ ] Action types correct
- [ ] User names show
- [ ] New event slides in smoothly
- [ ] Clicking event opens correct thread
- [ ] No duplicate entries

### Lead Data
- [ ] Lead badges consistent
- [ ] Lead score correct (0-100)
- [ ] Lead score updates correctly
- [ ] Lead status accurate
- [ ] Lead information displays correctly

---

## Actions & Integrations

### Action Buttons
- [ ] Call Now button works
- [ ] Send Estimate Link button works
- [ ] Mark as Booked button works
- [ ] Add Task button works
- [ ] Add to CRM button works
- [ ] All actions log correctly
- [ ] All actions update metrics

### Booked Jobs
- [ ] Booked jobs recorded correctly
- [ ] Status updates to "booked"
- [ ] Lead status updated
- [ ] Activity logged
- [ ] Metrics updated
- [ ] CRM sync works (if enabled)

### CRM Integrations
- [ ] HubSpot integration works
- [ ] Salesforce integration works
- [ ] Data synced correctly
- [ ] No duplicate records
- [ ] Error handling works

### Task Creation
- [ ] Task modal opens
- [ ] Task created correctly
- [ ] Task appears in task list
- [ ] Due date set correctly
- [ ] Task linked to thread

---

## AI & Classification

### AI Intent Classification
- [ ] AI intent correct on test set (30-50 cases)
- [ ] Hot intent classified correctly
- [ ] Warm intent classified correctly
- [ ] Cold intent classified correctly
- [ ] Not Interested classified correctly
- [ ] Follow-Up classified correctly
- [ ] Confidence scores reasonable (0-1)

### Lead Scoring
- [ ] Lead scores accurate (0-100)
- [ ] Scores update on new data
- [ ] Score calculation matches backend
- [ ] Scores display correctly in UI

### Tag Extraction
- [ ] Tags extracted correctly
- [ ] Relevant keywords tagged
- [ ] Tags display in UI
- [ ] Tags update on re-classification

### AI Summary
- [ ] Summaries generated correctly
- [ ] Summaries display in UI
- [ ] Reasoning text shows
- [ ] Suggested actions visible
- [ ] Summary updates on new messages

---

## Notifications & Settings

### Notification Delivery
- [ ] Notifications respect settings
- [ ] Hot intent notifications work
- [ ] Warm intent notifications work
- [ ] Follow-up notifications work
- [ ] Booked notifications work
- [ ] Quiet hours work correctly
- [ ] Notifications queued during quiet hours
- [ ] Notifications sent after quiet hours
- [ ] Banner appears in UI
- [ ] Push notifications work (if enabled)

### Settings Panel
- [ ] Default tab saved correctly
- [ ] Default tab loads on page load
- [ ] Quiet hours stored properly
- [ ] Quiet hours handle midnight crossover
- [ ] Notification toggles update DB
- [ ] Lead weighting stored correctly
- [ ] Settings validation works
- [ ] Settings persist across sessions

---

## User Experience

### UI/UX Quality
- [ ] Inbox feels premium
- [ ] Loading states smooth
- [ ] Empty states excellent
- [ ] Error states helpful
- [ ] No broken links
- [ ] No malformed HTML
- [ ] Consistent styling
- [ ] Accessible (keyboard navigation)
- [ ] Accessible (screen readers)

### Console & Errors
- [ ] No console errors
- [ ] No console warnings
- [ ] Error handling graceful
- [ ] Error messages helpful
- [ ] Network errors handled
- [ ] Timeout errors handled

### Mobile Experience
- [ ] Works on mobile (iOS Safari)
- [ ] Works on mobile (Android Chrome)
- [ ] Responsive design works
- [ ] Touch interactions work
- [ ] Small screens supported
- [ ] Mobile performance acceptable

### Multi-User Support
- [ ] Works for multiple team members
- [ ] User isolation correct (RLS)
- [ ] Shared threads work correctly
- [ ] Permissions enforced
- [ ] No data leakage between users

### Onboarding & Tours
- [ ] Tour triggers correctly (first visit)
- [ ] Tour steps work correctly
- [ ] Demo mode works
- [ ] Demo mode dismissible
- [ ] Help text accurate
- [ ] Tooltips helpful

---

## Database & Backend

### Database Performance
- [ ] DB indexes tuned
- [ ] Query performance acceptable
- [ ] No N+1 queries
- [ ] Connection pooling works
- [ ] Database migrations clean

### Data Integrity
- [ ] No duplicate messages
- [ ] No orphaned threads
- [ ] Foreign keys enforced
- [ ] Constraints work correctly
- [ ] Data validation works

### Webhook Handling
- [ ] Webhook deduplication works
- [ ] Webhook retries work
- [ ] Webhook errors logged
- [ ] Webhook signature verification works
- [ ] Webhook rate limiting works

### Real-Time Updates
- [ ] WebSocket connection stable
- [ ] Updates delivered reliably
- [ ] No message loss
- [ ] No duplicate updates
- [ ] Reconnection works

---

## Security & Compliance

### Security
- [ ] Row Level Security (RLS) enforced
- [ ] User data isolated
- [ ] API endpoints secured
- [ ] Webhook signatures verified
- [ ] SQL injection prevented
- [ ] XSS prevented
- [ ] CSRF protection works

### Compliance
- [ ] GDPR compliance (data deletion)
- [ ] Email compliance (unsubscribe)
- [ ] Privacy settings respected
- [ ] Data retention policies followed

---

## Cross-Browser Compatibility

- [ ] Chrome (desktop) - Latest
- [ ] Chrome (desktop) - Previous version
- [ ] Safari (desktop) - Latest
- [ ] Safari (desktop) - Previous version
- [ ] Firefox (desktop) - Latest
- [ ] Edge (desktop) - Latest
- [ ] Chrome (mobile) - Latest
- [ ] Safari (mobile) - Latest

---

## Test Coverage

### Automated Tests
- [ ] Webhook tests pass (`tests/inbox-webhook.test.ts`)
- [ ] Database tests pass (`tests/inbox-db.test.ts`)
- [ ] AI tests pass (`tests/inbox-ai.test.ts`)
- [ ] Settings tests pass (`tests/inbox-settings.test.ts`)
- [ ] Test coverage > 80%

### Manual Tests
- [ ] All manual test cases executed
- [ ] Test results documented
- [ ] Bugs logged and fixed
- [ ] Regression tests pass

### Integration Tests
- [ ] Email → Webhook → DB flow works
- [ ] Webhook → AI → UI flow works
- [ ] Settings → Notifications flow works
- [ ] Actions → CRM flow works

---

## Documentation

- [ ] Test plan documented
- [ ] Manual test cases documented
- [ ] Test results documented
- [ ] Known issues documented
- [ ] Deployment guide updated
- [ ] User guide updated (if applicable)

---

## Final Sign-Off

**QA Lead:** _________________ **Date:** _________________

**Engineering Lead:** _________________ **Date:** _________________

**Product Lead:** _________________ **Date:** _________________

**Status:** ☐ Ready for Beta ☐ Ready for Production ☐ Needs More Work

---

## Notes

_Add any additional notes, known issues, or concerns here:_



















































