## SmartSend Smoke Test (Pre-Launch)

Step-by-step checklist and expected outcomes.

1. Signup
   - Visit `/signup` and create an account
   - Expect: confirmation notice and email link; after auth callback, land on Getting Started

2. Upgrade
   - Go to `/dashboard/billing` and start plan (test keys)
   - Expect: subscription active; pricing reflects Pro

3. Connect mailbox
   - Navigate to `/settings/mailbox`
   - Configure SMTP (demo creds) and Send Test
   - Expect: “Configured” badge; test returns ok

4. Import leads
   - Go to `/leads/import` and upload `public/leads_template.csv` or use API `/api/leads/import`
   - Expect: import summary with counts; onboarding flag set

5. Launch sequence
   - Visit `/sequences/new`, enter 3 steps with %UNSUB% and address, Save & Start
   - Expect: status becomes running; queued emails appear

6. Unsubscribe
   - Click unsubscribe link from a test email
   - Expect: `/unsubscribe` page confirms removal

7. Referral link
   - Open `/invite` and copy your link
   - New user signs up via `?ref=<id>`
   - Expect: referral recorded in `referrals`

8. Dashboard metrics
   - Go to `/dashboard`
   - Expect: Daily Sends shows usage; if <20% remain, 80% warning; quiet hours banner (22–06 UTC); mailbox error banner if misconfigured

9. Demo campaign (optional)
   - Press Launch Demo Campaign
   - Expect: queued sends and initial metrics

