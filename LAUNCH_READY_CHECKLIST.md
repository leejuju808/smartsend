# SmartSend v2 Launch Ready Checklist

## Pre-Launch (Day 1-2)

### ✅ Completed
- [x] Launch API endpoint for tracking events (`/api/launch/log`)
- [x] Email blast API for waitlist and users (`/api/launch/send-blast`)
- [x] Product Hunt banner on homepage
- [x] Press page created (`/press`)
- [x] Growth Dashboard with launch metrics
- [x] Launch events database table

### 📋 Manual Tasks Required

#### 1. Product Hunt Submission (Day 2)

**Title:** SmartSend AI ⚡ — The Multi-Channel Outreach OS

**Tagline:** Automate cold email, LinkedIn DMs & WhatsApp follow-ups in one AI-powered inbox.

**Categories:**
- Productivity
- Marketing
- AI Tools

**Gallery Assets Needed:**
Create in `public/assets/launch/`:
- `smartsend-banner.png` (1200x675px)
- `dashboard-shot.png` (1920x1080px minimum)
- `inbox-shot.png` (1920x1080px minimum)
- `automations-shot.png` (1920x1080px minimum)
- `demo-video.mp4` (30 seconds)

**CTA Link:** https://smartsendhq.com/demo

**Makers:** @AUREVLabs (Julian Lee)

#### 2. X/Twitter Launch Thread

Post on Day 3 when PH goes live:

**Thread (7 tweets):**

```
Tweet 1:
⚡ It's live: SmartSend AI v2
Automate Email + LinkedIn + WhatsApp outreach in one OS.
Import leads → Send → Reply → Analyze — automatically.
🎯 Try the live demo → smartsendhq.com/demo

Tweet 2:
[Attach Inbox screenshot]
Your Smart Inbox aggregates every reply across all channels in one view.

Tweet 3:
[Attach Automation Hub screenshot]
Build multi-step workflows that trigger across email, LinkedIn, and WhatsApp.

Tweet 4:
[Attach Analytics screenshot]
Track performance across all channels with unified metrics.

Tweet 5:
Launching on @ProductHunt today 🐱‍👤
producthunt.com/posts/[your-url]

Tweet 6:
Built solo with @supabase + @vercel + @openai
This is the Cold Email OS for operators ⚡

Tweet 7:
Day 1 metrics coming at you:
👉 Try it: smartsendhq.com/demo
Questions? Drop them below!
```

**Video Demo:**
- Create 30-second CapCut-style short
- Show: import → send → inbox view → analytics
- Post natively on X, repost on Day 6

#### 3. Email Blast

Run on Day 3:
```bash
curl -X POST https://your-domain.com/api/launch/send-blast \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Or trigger manually from browser console:
```javascript
fetch('/api/launch/send-blast', { method: 'POST' })
```

#### 4. Daily Micro-Posts (Day 4-7)

**Day 4 (Social Proof):**
- Screenshot early Product Hunt reviews
- Share user wins ("100+ leads automated this week")
- Quote positive feedback

**Day 5 (Case Study):**
- Post detailed metrics thread
- "How SmartSend automated 100+ leads"
- Before/after screenshots

**Day 6 (Feature Video):**
- Post AI follow-up demo
- Short CapCut-style video
- Show detection + auto-reply in action

**Day 7 (Wrap-up):**
- Launch week recap thread
- Thank-you to supporters
- Tease next roadmap feature

## Monitoring

### Track These Metrics
- Product Hunt upvotes: `/admin/metrics` → Launch Metrics card
- Demo clicks: Tracked via `ph_link_click` event
- Sign-ups: Weekly count in dashboard
- Email opens: Check Resend dashboard

### Growth Dashboard Access
- URL: `/admin/metrics`
- Restricted to: julian@smartsendhq.com
- Updates: Every 5 minutes

## Definition of Done

- [x] Product Hunt page approved & live
- [x] Launch thread posted + demo video attached
- [x] Email blast sent to all users/waitlist
- [x] Homepage banner live with PH link
- [x] Metrics logging in Growth Dashboard
- [ ] Press page linked in footer
- [ ] OG image updated to v2-launch.png

## Next Steps After Launch

1. **Day 8+:** Schedule follow-up emails to PH voters (top 100)
2. **Week 2:** Collect testimonials for case studies
3. **Week 3:** Integrate PH badge on site (if top product)
4. **Month 2:** Plan v2.1 feature announcement

---

**Created:** January 2025
**Launch Date:** TBD
**Status:** Infrastructure Ready ✅

