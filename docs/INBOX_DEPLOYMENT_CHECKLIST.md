# Inbox Deployment Checklist

**Block 19750 — Production Deployment Checklist**

Use this checklist before enabling inbox for ANY roofing company.

---

## Pre-Deployment Checklist

### Database & Migrations
- [ ] All migrations run successfully
- [ ] `inbox_enabled` and `beta_access_level` columns exist in `profiles` table
- [ ] All rollout tracking tables created (`inbox_rollout_tracking`, `inbox_rollout_metrics`, etc.)
- [ ] Database functions created (`has_inbox_access`, `enroll_inbox_beta`, etc.)
- [ ] Views created (`v_inbox_rollout_last_24h`, `v_inbox_hot_leads_today`, etc.)

### Security & RLS
- [ ] RLS policies tested on all new tables
- [ ] Users can only see their own data
- [ ] Internal monitoring dashboard restricted to internal users only
- [ ] Feature flag checks working correctly

### Webhook & Integration
- [ ] Webhook endpoint verified and active
- [ ] Email provider webhook configured correctly
- [ ] Test webhook received successfully
- [ ] Replies are being captured

### AI Worker
- [ ] AI classification worker healthy
- [ ] Lead scoring working correctly
- [ ] Intent detection accurate
- [ ] Error handling in place

### All Integrations Tested
- [ ] Email sending integration tested
- [ ] Reply ingestion tested
- [ ] Thread creation tested
- [ ] Notification system tested

### Feature Flags Applied
- [ ] `inbox_enabled` defaults to `false`
- [ ] `beta_access_level` defaults to `public`
- [ ] Only internal users have access initially
- [ ] Navigation correctly hides inbox for non-beta users

### Demo Mode
- [ ] Demo mode stable
- [ ] Test data displays correctly
- [ ] Demo mode doesn't affect real data

### Tour & Onboarding
- [ ] Tour triggers once per user
- [ ] Tour doesn't break on refresh
- [ ] Onboarding flow works correctly

### Metrics Bar
- [ ] Metrics bar accurate
- [ ] Real-time updates working
- [ ] Performance acceptable

### Activity Feed
- [ ] Activity feed logs correctly
- [ ] Events appear in real-time
- [ ] Filtering works

### Mobile Testing
- [ ] Mobile navigation works
- [ ] Inbox accessible on mobile
- [ ] Touch interactions work
- [ ] Responsive design correct

### Browser Testing
- [ ] Chrome tested
- [ ] Safari tested
- [ ] Firefox tested
- [ ] Edge tested (if applicable)

### Console Errors
- [ ] No console errors in production
- [ ] All API calls successful
- [ ] No failed network requests

### Performance
- [ ] Inbox load time < 2 seconds
- [ ] Thread detail load < 1 second
- [ ] Real-time updates < 500ms lag
- [ ] No memory leaks

### Monitoring Alerts
- [ ] Monitoring dashboard accessible
- [ ] Alerts configured for failures
- [ ] Error logging working
- [ ] Metrics collection active

### Onboarding Script Ready
- [ ] Onboarding documentation complete
- [ ] Email templates ready
- [ ] Troubleshooting guide available
- [ ] Support contact information ready

---

## Phase 1: Internal Testing (3-5 days)

### Setup
- [ ] Enroll yourself: `enroll_inbox_beta('[your_user_id]', 'internal')`
- [ ] Create test workspace
- [ ] Add 3-5 fake homeowner contacts

### Testing
- [ ] Automated inbound tests pass
- [ ] Manual UI verification on laptop
- [ ] Manual UI verification on mobile
- [ ] Performance tests pass
- [ ] No bugs found
- [ ] No broken flows

### Sign-Off
- [ ] All tests pass
- [ ] Ready for Phase 2

---

## Phase 2: Ultra-Private Beta (2-3 Roofing Companies)

### Selection
- [ ] Selected 2-3 trustworthy testers
- [ ] They understand this is "early access"
- [ ] Manual expectations set

### Enrollment
- [ ] Enrolled via `enroll_inbox_beta()` function
- [ ] Added to locked workspace
- [ ] Invited via private link
- [ ] Sent "How to Use Inbox" PDF

### Monitoring
- [ ] Daily monitoring of inbox logs
- [ ] Capturing confusion points
- [ ] Capturing mis-clicks
- [ ] Capturing slow moments
- [ ] Capturing actual roofing conversation patterns

### Sign-Off
- [ ] Real-world feedback collected
- [ ] No critical issues
- [ ] Ready for Phase 3

---

## Phase 3: Controlled 10-Client Founders Beta (60-90 days)

### Selection
- [ ] Selected 10 roofing companies
- [ ] They receive lifetime rate
- [ ] Personal onboarding scheduled
- [ ] Weekly check-ins scheduled

### Enrollment
- [ ] Strict invite-only process
- [ ] Manual approval completed
- [ ] DNS/sending setup verified
- [ ] Inbox flows monitored through logs

### Monitoring
- [ ] Weekly metrics review
- [ ] Sentiment tracking
- [ ] Issue response within SLA
- [ ] High-touch support provided

### Sign-Off
- [ ] All 10 companies active
- [ ] No critical issues
- [ ] Ready for public launch

---

## Post-Deployment Monitoring

### First 24 Hours
- [ ] Monitor `/internal/inbox-monitor` every hour
- [ ] Check for failures
- [ ] Verify replies being captured
- [ ] Respond to any issues immediately

### First Week
- [ ] Daily metrics review
- [ ] User sentiment check
- [ ] Issue log review
- [ ] Performance monitoring

### Ongoing
- [ ] Weekly metrics review
- [ ] Monthly sentiment survey
- [ ] Quarterly feature review
- [ ] Continuous improvement

---

## Rollback Plan

If critical issues arise:

1. **Disable inbox for affected users:**
   ```sql
   UPDATE profiles
   SET inbox_enabled = false
   WHERE id IN ('[user_id_1]', '[user_id_2]');
   ```

2. **Investigate root cause:**
   - Check `inbox_rollout_issues` table
   - Review `inbox_inbound_events` for errors
   - Check webhook logs

3. **Fix issue:**
   - Apply hotfix
   - Test thoroughly
   - Re-enable for users

4. **Document:**
   - Log issue in `inbox_rollout_issues`
   - Update resolution notes
   - Share learnings with team

---

## Success Criteria

Before moving to next phase:

- ✅ Zero critical bugs
- ✅ Reply capture rate > 95%
- ✅ Average load time < 2 seconds
- ✅ User sentiment score ≥ 4/5
- ✅ No open severity 1 issues
- ✅ All testers successfully onboarded

---

**Last Updated:** [Date]
**Version:** 1.0



















































