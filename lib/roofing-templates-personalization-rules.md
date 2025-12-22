# Block 11100 — SmartSend Roofing Templates Personalization Engine Rules

## Overview

These personalization rules make the templates feel human and maximize replies. They're designed to mimic how roofers actually talk — blue-collar, direct, and no-nonsense.

## The 5 Core Rules

### Rule 1: Mention Their City or Area

**Always include location context:**
- ✅ "helping homeowners in {{city}}"
- ✅ "We're in {{city}} today if you want us to stop by"
- ❌ "We help homeowners" (too generic)

**Why:** Local references build trust and make the message feel personal, not spammy.

---

### Rule 2: Keep the Tone Blue-Collar + Direct

**Roofers do NOT talk like marketers.**

**Good examples:**
- ✅ "Quick question about your roof"
- ✅ "Just checking in"
- ✅ "Do you need anyone to take a look?"
- ✅ "We've got a slot open this week"

**Bad examples:**
- ❌ "I hope this email finds you well"
- ❌ "I wanted to reach out regarding"
- ❌ "At your earliest convenience"
- ❌ "I would be delighted to assist"

**Why:** Roofers are blue-collar professionals. They talk straight. SmartSend mimics their tone.

---

### Rule 3: Never More Than 3 Sentences

**Short emails get replies. Long emails get ignored.**

**Structure:**
1. **Opener** (1 sentence) — Quick, direct question or statement
2. **Context** (1 sentence) — Why you're reaching out
3. **CTA** (1 sentence) — One simple question

**Example:**
```
Hey {{first_name}},

We're helping homeowners in {{city}} with repairs and inspections before weather changes.

Do you need anyone to take a look at your roof?
```

**Why:** Roofers are busy. They scan emails in seconds. Keep it short.

---

### Rule 4: Use Natural Language, Not AI-Sounding Phrases

**Avoid corporate/marketing speak:**

**Bad:**
- ❌ "I was reaching out regarding..."
- ❌ "I wanted to touch base about..."
- ❌ "I hope you're doing well"
- ❌ "I would like to offer my services"

**Good:**
- ✅ "Quick question"
- ✅ "Just checking in"
- ✅ "Hey {{first_name}}"
- ✅ "Want me to take a look?"

**Why:** AI-sounding phrases trigger spam filters and feel fake. Natural language feels human.

---

### Rule 5: ALWAYS Single Call-to-Action

**One simple question = more replies.**

**Good:**
- ✅ "Do you need anyone to take a look at your roof?"
- ✅ "Want me to put you on the schedule?"
- ✅ "Just reply 'yes'."

**Bad:**
- ❌ "Would you like an inspection, estimate, or consultation?"
- ❌ "Let me know if you're interested or have any questions!"

**Why:** Multiple CTAs create decision paralysis. One question = one action = more replies.

---

## Template Variables

All templates support these variables:

- `{{first_name}}` — Contact's first name
- `{{city}}` — Contact's city
- `{{season}}` — Current season (fall, spring, winter, summer)

**Usage:**
- Always use `{{first_name}}` in the opener
- Always use `{{city}}` for local context
- Use `{{season}}` for seasonal templates

---

## Implementation Notes

These rules are enforced in:
1. **Template creation** — All Block 11100 templates follow these rules
2. **AI rewrite engine** — When templates are rewritten, these rules are applied
3. **Campaign builder** — Users can edit templates, but defaults follow these rules

---

## Why These Rules Work

1. **Removes thinking** — Roofers don't need to know what to say
2. **Feels human** — Mimics how roofers actually talk
3. **Gets replies** — Short, direct, local = maximum engagement
4. **Builds trust** — Blue-collar tone matches their audience
5. **Scales** — Works for any roofer, any market, any season

---

## Examples

### ✅ Good Template (Follows All Rules)

**Subject:** Quick question about your roof

**Body:**
```
Hey {{first_name}},

We're helping homeowners in {{city}} with repairs and inspections before weather changes.

Do you need anyone to take a look at your roof?
```

**Why it works:**
- ✅ Mentions city (Rule 1)
- ✅ Blue-collar tone (Rule 2)
- ✅ 3 sentences (Rule 3)
- ✅ Natural language (Rule 4)
- ✅ Single CTA (Rule 5)

---

### ❌ Bad Template (Violates Rules)

**Subject:** I wanted to reach out regarding your roofing needs

**Body:**
```
Dear {{first_name}},

I hope this email finds you well. I wanted to reach out regarding your roofing needs and offer our professional services. We are a leading roofing company in the area and would be delighted to assist you with any repairs, replacements, or inspections you may require.

Please let me know if you're interested or have any questions. I look forward to hearing from you at your earliest convenience.

Best regards,
```

**Why it fails:**
- ❌ No city mention (Rule 1)
- ❌ Corporate/marketing tone (Rule 2)
- ❌ Too long (Rule 3)
- ❌ AI-sounding phrases (Rule 4)
- ❌ Multiple CTAs (Rule 5)

---

## Summary

**SmartSend templates make roofers feel:**
> "SmartSend already knows my business better than I do."

**Because:**
- They don't need to write anything
- The tone matches their audience
- The messages get replies
- It feels done-for-you

That's Block 11100.























































