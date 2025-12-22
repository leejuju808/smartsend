# Lead Scoring System Test Plan

## Test Overview

This document outlines the testing strategy for the lead scoring system to ensure it works correctly across all components.

## Test Environment Requirements

- Supabase database with test data
- Next.js application running locally
- Test email addresses for tracking
- Access to email tracking pixels and click tracking

## Test Scenarios

### 1. Database Schema Tests

#### 1.1 Column Creation
- [ ] Verify `lead_score` column exists in `contacts` table
- [ ] Confirm default value is 0
- [ ] Verify index exists for performance

#### 1.2 Function Creation
- [ ] Test `increment_score` function with all event types
- [ ] Test `add_tag_bonus` function with all tag types
- [ ] Test `recompute_lead_scores` function
- [ ] Verify function permissions and security

### 2. Core Scoring Logic Tests

#### 2.1 Event Scoring
- [ ] **Open Event**: +1 point
  - Send test email
  - Open email (trigger pixel)
  - Verify score increases by 1
  
- [ ] **Click Event**: +3 points
  - Send test email with link
  - Click link
  - Verify score increases by 3
  
- [ ] **Reply Event**: +10 points
  - Send test email
  - Simulate reply
  - Verify score increases by 10

#### 2.2 Tag Bonuses
- [ ] **Hot Lead Tag**: +15 points
- [ ] **VIP Tag**: +25 points
- [ ] **Decision Maker Tag**: +20 points
- [ ] **Prospect Tag**: +5 points

#### 2.3 Score Accumulation
- [ ] Multiple events for same contact
- [ ] Score persistence across sessions
- [ ] Correct total calculation

### 3. API Endpoint Tests

#### 3.1 GET `/api/leads`
- [ ] Returns contacts sorted by score (descending)
- [ ] Includes all required fields (id, email, name, company, lead_score, created_at)
- [ ] Handles empty results gracefully
- [ ] Respects row limits

#### 3.2 POST `/api/leads/score`
- [ ] **Increment Action**: Adds custom points
- [ ] **Add Tag Action**: Applies tag bonus
- [ ] **Recompute Action**: Recalculates all scores
- [ ] Error handling for invalid requests
- [ ] Authentication and authorization

### 4. Frontend Dashboard Tests

#### 4.1 Data Display
- [ ] Contacts load correctly
- [ ] Scores display with proper formatting
- [ ] Color coding works for different tiers
- [ ] Statistics overview shows correct numbers

#### 4.2 Sorting and Filtering
- [ ] Sort by score (ascending/descending)
- [ ] Sort by name, company, date
- [ ] Search functionality works
- [ ] Filter results update in real-time

#### 4.3 User Experience
- [ ] Loading states display correctly
- [ ] Error handling for failed requests
- [ ] Responsive design on different screen sizes
- [ ] Accessibility features work

### 5. Integration Tests

#### 5.1 Email Tracking Integration
- [ ] Open tracking pixels update scores
- [ ] Click tracking updates scores
- [ ] Reply processing updates scores
- [ ] No duplicate score updates

#### 5.2 Real-time Updates
- [ ] Dashboard reflects changes immediately
- [ ] No race conditions in score updates
- [ ] Concurrent event handling

### 6. Cron Job Tests

#### 6.1 Score Recomputation
- [ ] Function runs successfully
- [ ] All scores recalculated correctly
- [ ] Performance acceptable for large datasets
- [ ] Error handling and logging

#### 6.2 Scheduling
- [ ] Cron job triggers at specified time
- [ ] No duplicate executions
- [ ] Logs execution results

## Test Data Setup

### Required Test Contacts
```sql
-- Create test contacts with known email addresses
INSERT INTO contacts (email, name, company, user_id) VALUES
('test-open@example.com', 'Test Open', 'Test Co', 'test-user-id'),
('test-click@example.com', 'Test Click', 'Test Co', 'test-user-id'),
('test-reply@example.com', 'Test Reply', 'Test Co', 'test-user-id'),
('test-tag@example.com', 'Test Tag', 'Test Co', 'test-user-id'),
('test-combined@example.com', 'Test Combined', 'Test Co', 'test-user-id');
```

### Required Test Campaigns
```sql
-- Create test campaigns for tracking
INSERT INTO campaigns (id, name, user_id) VALUES
('test-campaign-1', 'Test Campaign 1', 'test-user-id'),
('test-campaign-2', 'Test Campaign 2', 'test-user-id');
```

## Test Execution Steps

### Phase 1: Database Tests
1. Run database migration
2. Execute test script: `npx tsx scripts/test-lead-scoring.ts`
3. Verify all functions work correctly
4. Check data integrity

### Phase 2: API Tests
1. Start Next.js application
2. Test API endpoints with Postman/curl
3. Verify response formats and error handling
4. Test authentication and authorization

### Phase 3: Frontend Tests
1. Navigate to `/dashboard/leads`
2. Test all UI components
3. Verify data loading and display
4. Test sorting, filtering, and search

### Phase 4: Integration Tests
1. Send test emails with tracking
2. Trigger open/click events
3. Simulate reply processing
4. Verify score updates in real-time

### Phase 5: Cron Job Tests
1. Deploy cron function
2. Test manual execution
3. Verify scheduled execution
4. Check logs and error handling

## Expected Results

### Score Calculations
- **Open + Click + Reply**: 1 + 3 + 10 = 14 points
- **With Hot Lead Tag**: 14 + 15 = 29 points
- **Multiple Events**: Accumulate correctly

### Dashboard Display
- Contacts sorted by score (highest first)
- Color-coded score tiers
- Accurate statistics
- Responsive and accessible

### Performance
- Page load time < 2 seconds
- Score updates < 100ms
- Cron job completes < 30 seconds for 10k contacts

## Success Criteria

- [ ] All test scenarios pass
- [ ] No critical bugs found
- [ ] Performance meets requirements
- [ ] Security requirements satisfied
- [ ] Documentation complete and accurate

## Rollback Plan

If critical issues are found:
1. Disable lead scoring functions
2. Remove `lead_score` column (if needed)
3. Revert tracking route changes
4. Restore previous functionality

## Post-Test Actions

1. **Document Results**: Record all test outcomes
2. **Bug Fixes**: Address any issues found
3. **Performance Optimization**: Improve any slow operations
4. **User Training**: Prepare documentation for end users
5. **Monitoring Setup**: Configure alerts for production

---

**Test Lead**: [Your Name]  
**Date**: [Test Date]  
**Version**: 1.0.0 