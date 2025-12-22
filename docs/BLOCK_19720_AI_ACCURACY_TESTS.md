# Block 19720 — AI Accuracy Test Cases

**30-50 AI evaluation test cases for intent classification and lead scoring**

## Test Execution

For each test case:
1. Send test email with known content
2. Wait for AI classification (1-3 minutes)
3. Verify intent matches expected
4. Verify score within expected range
5. Verify tags include expected keywords
6. Log results for accuracy tracking

---

## Category: Storm Damage

### Test Case AI-1: Storm Damage - Direct Mention
**Input:**
```
Subject: Roof Damage from Storm
Body: My roof was damaged in the storm last week. I need someone to come out and look at it ASAP.
```

**Expected:**
- Intent: HOT
- Score Range: 80-100
- Tags: ["storm", "damage", "urgent", "inspection"]
- Confidence: > 0.8

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case AI-2: Storm Damage - Insurance Claim Mentioned
**Input:**
```
Subject: Insurance Claim - Need Inspection
Body: I filed an insurance claim for roof damage from the recent storm. When can you come out to inspect?
```

**Expected:**
- Intent: HOT
- Score Range: 85-100
- Tags: ["storm", "damage", "insurance", "claim", "inspection"]
- Confidence: > 0.85

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

## Category: Active Leaking

### Test Case AI-3: Active Leak - Urgent
**Input:**
```
Subject: URGENT: Leak in Ceiling
Body: Water is coming through my ceiling right now. This is urgent! Can someone come out today?
```

**Expected:**
- Intent: HOT
- Score Range: 90-100
- Tags: ["leak", "urgent", "emergency", "water", "ceiling"]
- Confidence: > 0.9

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case AI-4: Active Leak - Multiple Mentions
**Input:**
```
Subject: Roof Leak
Body: I have a leak in my roof. Water is coming in. I need this fixed immediately. Please call me ASAP.
```

**Expected:**
- Intent: HOT
- Score Range: 85-100
- Tags: ["leak", "urgent", "water", "roof", "emergency"]
- Confidence: > 0.85

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

## Category: Insurance Claim

### Test Case AI-5: Insurance Claim - Active
**Input:**
```
Subject: Insurance Claim Inspection
Body: I filed an insurance claim, when can you inspect? The adjuster is coming next week.
```

**Expected:**
- Intent: HOT
- Score Range: 85-95
- Tags: ["insurance", "claim", "inspection", "adjuster"]
- Confidence: > 0.85

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

## Category: Inspection Request

### Test Case AI-6: Direct Inspection Request
**Input:**
```
Subject: Roof Inspection Request
Body: Can someone come out to look at my roof? I think there might be damage.
```

**Expected:**
- Intent: HOT
- Score Range: 75-90
- Tags: ["inspection", "appointment", "damage"]
- Confidence: > 0.75

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case AI-7: Inspection Request - Vague
**Input:**
```
Subject: Need Someone to Look
Body: I need someone to come out and look at my roof sometime.
```

**Expected:**
- Intent: WARM or HOT
- Score Range: 60-85
- Tags: ["inspection", "appointment"]
- Confidence: > 0.6

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

## Category: Price Shopping

### Test Case AI-8: Price Question - Direct
**Input:**
```
Subject: Roof Replacement Cost
Body: What would a new roof cost? I am considering replacing mine.
```

**Expected:**
- Intent: WARM
- Score Range: 50-70
- Tags: ["pricing", "quote", "replacement", "cost"]
- Confidence: > 0.6

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case AI-9: Price Question - Simple
**Input:**
```
Subject: How Much?
Body: How much does this cost?
```

**Expected:**
- Intent: WARM
- Score Range: 50-65
- Tags: ["pricing", "cost"]
- Confidence: > 0.5

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case AI-10: Price Comparison
**Input:**
```
Subject: Getting Quotes
Body: I am getting quotes from several contractors. What would you charge for a new roof?
```

**Expected:**
- Intent: WARM
- Score Range: 55-75
- Tags: ["pricing", "quote", "comparison", "replacement"]
- Confidence: > 0.6

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

## Category: Dead Lead

### Test Case AI-11: Not Interested - Direct
**Input:**
```
Subject: Not Interested
Body: We are not interested at this time. Please remove us from your list.
```

**Expected:**
- Intent: NOT_INTERESTED
- Score Range: 0-20
- Tags: ["not_interested", "unsubscribe"]
- Confidence: > 0.8

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case AI-12: Unsubscribe Request
**Input:**
```
Subject: Unsubscribe Request
Body: Please remove me from your email list. Not interested.
```

**Expected:**
- Intent: NOT_INTERESTED
- Score Range: 0-15
- Tags: ["unsubscribe", "remove", "not_interested"]
- Confidence: > 0.9

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case AI-13: Already Handled
**Input:**
```
Subject: Already Fixed
Body: We already had our roof fixed by someone else. Thanks anyway.
```

**Expected:**
- Intent: NOT_INTERESTED
- Score Range: 10-30
- Tags: ["already_handled", "not_interested"]
- Confidence: > 0.7

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

## Category: Ghosting Follow-Up

### Test Case AI-14: Ghosting Follow-Up - Still Interested
**Input:**
```
Subject: Follow-up: Still Interested
Body: Sorry for the delay, I am still interested in getting a quote.
```

**Expected:**
- Intent: WARM
- Score Range: 40-60
- Tags: ["follow_up", "quote", "interested"]
- Confidence: > 0.5

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case AI-15: Ghosting Follow-Up - Apologetic
**Input:**
```
Subject: Re: Roof Estimate
Body: Sorry I haven't responded. I've been busy. Still interested though.
```

**Expected:**
- Intent: WARM
- Score Range: 35-55
- Tags: ["follow_up", "interested"]
- Confidence: > 0.5

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

## Category: Partial Info / Unclear

### Test Case AI-16: Partial Info - Generic Response
**Input:**
```
Subject: Re: Roofing Services
Body: Hi, I saw your email about roofing.
```

**Expected:**
- Intent: FOLLOW_UP
- Score Range: 30-50
- Tags: ["needs_follow_up"]
- Confidence: > 0.4

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case AI-17: Confusing Message
**Input:**
```
Subject: Considering Options
Body: Maybe, not sure, let me think about it.
```

**Expected:**
- Intent: FOLLOW_UP
- Score Range: 20-40
- Tags: ["unclear", "needs_follow_up"]
- Confidence: > 0.4

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case AI-18: Question Without Context
**Input:**
```
Subject: Question
Body: Do you work with insurance?
```

**Expected:**
- Intent: FOLLOW_UP or WARM
- Score Range: 40-60
- Tags: ["question", "insurance"]
- Confidence: > 0.5

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

## Category: Multi-Paragraph Emails

### Test Case AI-19: Long Email - Multiple Topics
**Input:**
```
Subject: Roof Damage Inquiry
Body: 
Hi there,

I received your email about roofing services. We had a big storm last month
and I noticed some shingles missing. I also have a leak in my attic that
started after the storm.

I am wondering what the cost would be to fix these issues. I have insurance
coverage, so I would like to know if you work with insurance companies.

Also, how soon could someone come out to take a look? This is getting worse
with each rain.

Thanks,
Homeowner
```

**Expected:**
- Intent: HOT (due to leak + urgency)
- Score Range: 75-95
- Tags: ["storm", "damage", "leak", "urgent", "insurance", "pricing"]
- Confidence: > 0.75

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case AI-20: Long Email - Story Format
**Input:**
```
Subject: My Roof Story
Body:
I've been thinking about replacing my roof for a while now. It's about 20 years old
and I've noticed some wear. Last week during the storm, I saw some shingles in my yard.

I'm not sure if I need a full replacement or just repairs. What do you think?
Also, what would the cost be? I'm on a budget but want quality work.

Let me know your thoughts.
```

**Expected:**
- Intent: WARM
- Score Range: 55-75
- Tags: ["replacement", "repair", "storm", "pricing", "budget"]
- Confidence: > 0.6

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

## Category: Multi-Language

### Test Case AI-21: Spanish - Quote Request
**Input:**
```
Subject: Cotización
Body: Necesito una cotización para mi techo. Tengo daños por la tormenta.
```

**Expected:**
- Intent: HOT
- Score Range: 70-90
- Tags: ["quote", "spanish", "storm", "damage"]
- Confidence: > 0.7

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case AI-22: Spanish - Not Interested
**Input:**
```
Subject: No Interesado
Body: No estoy interesado. Por favor elimínenme de su lista.
```

**Expected:**
- Intent: NOT_INTERESTED
- Score Range: 0-20
- Tags: ["not_interested", "spanish", "unsubscribe"]
- Confidence: > 0.8

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

## Category: Edge Cases

### Test Case AI-23: Empty Message
**Input:**
```
Subject: Re: Quote
Body: 
```

**Expected:**
- Intent: FOLLOW_UP
- Score Range: 20-40
- Tags: []
- Confidence: < 0.6

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case AI-24: Very Short Message
**Input:**
```
Subject: Re: Quote
Body: Yes
```

**Expected:**
- Intent: WARM or FOLLOW_UP
- Score Range: 40-60
- Tags: []
- Confidence: < 0.7

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

### Test Case AI-25: Special Characters
**Input:**
```
Subject: Urgent Quote Request
Body: I need a quote ASAP!!! $$$
```

**Expected:**
- Intent: HOT
- Score Range: 70-90
- Tags: ["urgent", "quote"]
- Confidence: > 0.7

**Actual:** ☐ HOT ☐ WARM ☐ COLD ☐ NOT_INTERESTED ☐ FOLLOW_UP
**Score:** ___
**Confidence:** ___
**Tags:** ___
**Pass/Fail:** ☐ Pass ☐ Fail

**Notes:**

---

## Accuracy Summary

**Total Test Cases:** 25+

**Passed:** ___

**Failed:** ___

**Accuracy Rate:** ___%

**Average Confidence:** ___

**Notes:**

---

## Recommendations

Based on test results, document any recommendations for improving AI classification:

1. 
2. 
3. 



















































