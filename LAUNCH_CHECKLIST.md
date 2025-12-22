# Launch Checklist — SmartSend AI Public Launch

## Pre-Launch Checklist

### Landing Page & Marketing
- [ ] Landing page published (smartsendhq.com)
- [ ] Domain connected: smartsendhq.com → Vercel
- [ ] OG meta tags added (`og:title`, `og:description`, `og:image`)
- [ ] Analytics snippet added (Plausible or PostHog)
- [ ] Test all CTAs ("Start Free", "Upgrade", "Join Agency")
- [ ] Mobile responsive on all breakpoints
- [ ] SEO meta tags (title, description, keywords)

### Demo Video
- [ ] Demo video script finalized (see `DEMO_VIDEO_SCRIPT.md`)
- [ ] Video recorded with OBS + CapCut
- [ ] Black-and-gold lightning overlay applied
- [ ] Video uploaded to X/Twitter
- [ ] Video uploaded to YouTube
- [ ] Video embedded on landing page
- [ ] Thumbnail created for YouTube

### Onboarding Flow
- [ ] Onboarding page created at `/dashboard/onboarding`
- [ ] Trigger logic wired: redirect if `team_id` has no campaigns
- [ ] Test flow: new user → onboarding → team setup
- [ ] Test flow: existing user with campaigns → skip onboarding

### Billing & Payments
- [ ] Stripe live keys configured
- [ ] Pricing plans created in Stripe:
  - [ ] Free plan ($0)
  - [ ] Pro plan ($49/mo)
  - [ ] Agency plan ($199/mo)
- [ ] Webhook endpoints tested
- [ ] Payment success flow tested
- [ ] Payment failure handling tested
- [ ] Refund process documented

### Technical
- [ ] All environment variables set in production
- [ ] Database migrations applied
- [ ] API endpoints tested
- [ ] Error monitoring set up (Sentry, LogRocket, etc.)
- [ ] Performance monitoring (Vercel Analytics, etc.)
- [ ] Backup strategy in place
- [ ] SSL certificate valid

### Content & Copy
- [ ] All landing page copy reviewed
- [ ] Pricing copy matches Stripe plans
- [ ] Feature descriptions accurate
- [ ] Footer copyright year updated
- [ ] Legal pages accessible (Privacy, Terms)

## Launch Day Tasks

### Social Media
- [ ] Post-launch tweets scheduled (3-day thread series)
- [ ] LinkedIn announcement post
- [ ] Product Hunt submission prepared
- [ ] Indie Hackers post drafted
- [ ] Reddit post in relevant subreddits (if allowed)

### Product Hunt
- [ ] Product Hunt listing created
- [ ] Screenshots and GIFs ready
- [ ] Maker comment prepared
- [ ] Submit at optimal time (00:00 PST)

### Email & Outreach
- [ ] Launch email to waitlist (if exists)
- [ ] Email to beta users announcing launch
- [ ] Email to investors/advisors (if applicable)

### Monitoring
- [ ] Set up alerts for:
  - [ ] Error rates
  - [ ] Payment failures
  - [ ] High server load
  - [ ] Failed email sends
- [ ] Monitor analytics dashboard
- [ ] Watch support channels (Discord, email, etc.)

## Post-Launch (First 72 Hours)

### Engagement
- [ ] Respond to all Product Hunt comments
- [ ] Reply to social media mentions
- [ ] Engage with early users
- [ ] Collect feedback via surveys/interviews

### Content
- [ ] Publish launch blog post
- [ ] Share case studies (if any)
- [ ] Create tutorial videos
- [ ] Update changelog/roadmap

### Optimization
- [ ] Review conversion metrics
- [ ] A/B test landing page CTAs
- [ ] Optimize onboarding flow based on drop-off data
- [ ] Fix any critical bugs reported

### Follow-Up
- [ ] Send thank-you email to early adopters
- [ ] Share launch results on social media
- [ ] Celebrate wins with team

## Success Metrics

Track these metrics for the first 30 days:

- [ ] **Signups**: Target first 10 paid users
- [ ] **Conversion Rate**: Landing → Signup
- [ ] **Activation Rate**: Signup → First Campaign
- [ ] **MRR Growth**: Track month-over-month
- [ ] **Churn Rate**: Monitor cancellations
- [ ] **NPS Score**: Survey users after 7 days

---

## Quick Reference

- **Landing Page**: `src/app/(marketing)/page.tsx`
- **Onboarding Page**: `src/app/dashboard/onboarding/page.tsx`
- **Demo Script**: `DEMO_VIDEO_SCRIPT.md`
- **Domain**: smartsendhq.com
- **Analytics**: [Your Analytics Dashboard URL]
- **Stripe Dashboard**: [Your Stripe Dashboard URL]

---

**Last Updated**: [Date]
**Launch Date**: [Target Date]
**Status**: 🟡 In Progress

