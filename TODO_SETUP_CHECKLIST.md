# ✅ Auto-Calendar Insert - Setup Checklist

Use this checklist to complete your setup:

## 📦 Installation

- [ ] **Run `npm install`** to install `ical-generator` package
  ```bash
  npm install
  ```

## 🔐 Environment Configuration

- [ ] **Create/update `.env.local`** with SMTP credentials
  ```env
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=587
  SMTP_USER=your-email@gmail.com
  SMTP_PASS=your-app-password
  SMTP_FROM="SmartSend AI <your-email@gmail.com>"
  
  NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
  ```

- [ ] **Get Gmail App Password** (if using Gmail)
  - Visit: https://myaccount.google.com/apppasswords
  - Generate new App Password
  - Use it as `SMTP_PASS`

## 🗄️ Database Setup

- [ ] **Run SQL migration** in Supabase SQL Editor
  - Copy contents from: `supabase-auto-calendar-migration.sql`
  - Paste into Supabase SQL Editor
  - Click "Run"

- [ ] **Verify tables created**
  ```sql
  -- Check if calendly_url column exists
  SELECT column_name FROM information_schema.columns 
  WHERE table_name = 'profiles' AND column_name = 'calendly_url';
  
  -- Check if meetings table exists
  SELECT * FROM meetings LIMIT 1;
  ```

- [ ] **Set your Calendly URL**
  ```sql
  UPDATE profiles 
  SET calendly_url = 'https://calendly.com/your-username/meeting' 
  WHERE email = 'your-email@example.com';
  ```

## 🧪 Testing

- [ ] **Start dev server**
  ```bash
  npm run dev
  ```

- [ ] **Run automated tests**
  ```bash
  ./scripts/test-reply-intent.sh
  ```

- [ ] **Verify test results**
  - Test 1: Meeting intent detected → Should send email
  - Test 2: No meeting intent → Neutral response
  - Test 3: Duplicate request → Idempotency works

- [ ] **Check your email inbox** for test invite

- [ ] **Verify database entry**
  ```sql
  SELECT * FROM meetings ORDER BY created_at DESC LIMIT 5;
  ```

## 🚀 Production Readiness

- [ ] **Replace Gmail SMTP** with production service (optional)
  - Consider: SendGrid, Mailgun, or Resend
  - Update SMTP_* env vars accordingly

- [ ] **Set up monitoring** for failed email sends
  ```sql
  SELECT COUNT(*) FROM meetings WHERE invite_status = 'failed';
  ```

- [ ] **Create MB/100 dashboard query**
  ```sql
  SELECT 
    DATE_TRUNC('day', created_at) as date,
    COUNT(*) as total_meetings,
    COUNT(*) FILTER (WHERE invite_status = 'sent') as sent,
    ROUND(COUNT(*) FILTER (WHERE invite_status = 'sent')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as success_rate
  FROM meetings
  WHERE created_at > NOW() - INTERVAL '30 days'
  GROUP BY date
  ORDER BY date DESC;
  ```

## 📚 Integration

- [ ] **Connect to email reply webhook**
  - Your webhook should call: `POST /api/reply-intent`
  - Include all required fields (see QUICKSTART.md)

- [ ] **Test end-to-end flow**
  - Send test email
  - Reply with meeting keywords
  - Verify invite is sent automatically

## 🎉 Launch

- [ ] **Announce to team** that Auto-Calendar Insert is live
- [ ] **Monitor first 10 invites** for any issues
- [ ] **Track MB/100 metric** weekly

---

## 📖 Reference Documents

- **Quick Setup**: `QUICKSTART.md`
- **Full Documentation**: `AUTO_CALENDAR_SETUP.md`
- **Environment Vars**: `SETUP_ENV_VARS.md`
- **Implementation Details**: `IMPLEMENTATION_SUMMARY.md`

## 🆘 Troubleshooting

### Common Issues

**"Cannot find module 'ical-generator'"**
- Solution: Run `npm install`

**"Profile not found"**
- Solution: Make sure senderEmail exists in profiles table

**Email not sending**
- Check SMTP credentials in .env.local
- For Gmail, use App Password (not regular password)
- Check console logs for specific error

**"Missing leadEmail" error**
- Solution: Include leadEmail in POST request body

---

✨ **Once all items are checked, your feature is ready to boost MB/100!**
