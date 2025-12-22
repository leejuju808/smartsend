# Contacts Import - Visual Usage Guide

Step-by-step guide with examples for importing contacts into SmartSend AI.

## 📥 Importing Your First Contacts

### Step 1: Prepare Your CSV File

Create a CSV file with at minimum an email column. Here's a simple example:

**contacts.csv**
```csv
Email,First Name,Last Name,Company,Title
john@acme.com,John,Smith,Acme Corp,CEO
sarah@techco.io,Sarah,Johnson,TechCo,VP Sales
mike@startup.com,Mike,Davis,StartupXYZ,Founder
```

**Required:**
- ✅ Email column (any of: Email, email, E-mail, Mail)

**Optional but recommended:**
- First Name / First / FirstName
- Last Name / Last / LastName
- Company / Organization / Org
- Title / Job Title / Position

### Step 2: Access Import Page

Navigate to: **http://localhost:3000/contacts/import**

Or from the contacts page, click the **"Import CSV"** button.

### Step 3: Upload Your CSV

```
┌─────────────────────────────────────────┐
│  Choose File    contacts.csv            │
│                                         │
│  📄 Drag and drop CSV here              │
│     or click to browse                  │
└─────────────────────────────────────────┘
```

The system will:
1. ✅ Parse the CSV
2. ✅ Detect headers
3. ✅ Auto-map common columns
4. ✅ Show preview of first 10 rows

### Step 4: Map Columns

The system auto-detects common column names, but you can adjust:

```
┌──────────────────┬──────────────────┬──────────────────┐
│ Email (required)*│ First name       │ Last name        │
│ [Email       ▼]  │ [First Name  ▼]  │ [Last Name   ▼]  │
└──────────────────┴──────────────────┴──────────────────┘
┌──────────────────┬──────────────────┐
│ Company          │ Title            │
│ [Company     ▼]  │ [Title       ▼]  │
└──────────────────┴──────────────────┘
```

**Mapping Tips:**
- Email is **required** (red asterisk)
- Other fields are optional
- Use dropdown to select source column
- Choose "— Not mapped —" to skip a field

### Step 5: Configure Import Options

```
┌─────────────────────────────────────────────────┐
│ Dedupe by: [Email ▼]                            │
│            Email                                 │
│            Email + Company                       │
│                                                  │
│ ☑ Skip suppressed (email/domain)                │
│                                                  │
│                 [Import 3 rows] ──────────────►  │
└─────────────────────────────────────────────────┘
```

**Deduplication Options:**

1. **By Email** (Recommended)
   - One contact per email address
   - `john@acme.com` can only exist once
   - Use for: General contact management

2. **By Email + Company**
   - Same email can exist at different companies
   - `john@acme.com` at Acme AND `john@acme.com` at TechCo
   - Use for: Tracking job changes, multi-company contacts

**Skip Suppressed:**
- ✅ Checked: Automatically filter out suppressed emails/domains
- ❌ Unchecked: Import everything (not recommended)

### Step 6: Review Preview

Before importing, review the first 10 rows:

```
┌────────────────────────────────────────────────────────┐
│ Preview (first 10 rows)                                │
├──────────────┬────────────┬───────────┬──────────┬─────┤
│ Email        │ First Name │ Last Name │ Company  │ ... │
├──────────────┼────────────┼───────────┼──────────┼─────┤
│ john@acme... │ John       │ Smith     │ Acme ... │ CEO │
│ sarah@tec... │ Sarah      │ Johnson   │ TechCo   │ VP  │
│ mike@star... │ Mike       │ Davis     │ Start... │ Fou │
└──────────────┴────────────┴───────────┴──────────┴─────┘
```

Check for:
- ✅ Correct column alignment
- ✅ Data looks accurate
- ✅ No obvious errors

### Step 7: Import & View Results

Click **"Import X rows"** button.

**Success Result:**
```
┌─────────────────────────────────────────┐
│ ✅ Import Successful                     │
│                                         │
│ Inserted: 3                             │
│ Skipped (existing): 0                   │
│ Suppressed (excluded): 0                │
│ Rejected: 0                             │
└─────────────────────────────────────────┘
```

**With Suppressions:**
```
┌─────────────────────────────────────────┐
│ ✅ Import Completed with Warnings        │
│                                         │
│ Inserted: 2                             │
│ Skipped (existing): 0                   │
│ Suppressed (excluded): 1                │
│ Rejected: 0                             │
└─────────────────────────────────────────┘
```

## 🚫 Managing Suppressions

Suppressions protect your sender reputation by blocking sends to known bad addresses.

### Access Suppressions Page

Navigate to: **http://localhost:3000/suppressions**

### Add Email Suppression

Block a specific email address:

```
┌─────────────────────────────────────────────────────┐
│ Type: [email ▼]                                     │
│                                                     │
│ Value: [user@blocked.com                         ]  │
│                                                     │
│ Reason: [Unsubscribed via email                  ]  │
│                                                     │
│                                          [Add] ──►  │
└─────────────────────────────────────────────────────┘
```

**When to use:**
- User explicitly unsubscribed
- Hard bounce (confirmed)
- Spam complaint
- Request for removal

### Add Domain Suppression

Block an entire domain:

```
┌─────────────────────────────────────────────────────┐
│ Type: [domain ▼]                                    │
│                                                     │
│ Value: [spamtrap.com                             ]  │
│                                                     │
│ Reason: [Known spam trap domain                  ]  │
│                                                     │
│                                          [Add] ──►  │
└─────────────────────────────────────────────────────┘
```

**When to use:**
- Known spam trap domains
- Competitor domains (policy)
- High bounce rate domains
- Blocklist domains

### View Suppressions

All suppressions are listed in a table:

```
┌──────────┬──────────────────────┬────────────────┬────────────┐
│ Type     │ Value                │ Reason         │ Created    │
├──────────┼──────────────────────┼────────────────┼────────────┤
│ email    │ spam@test.com        │ Unsubscribed   │ 2 days ago │
│ domain   │ spamtrap.com         │ Spam trap      │ 1 week ago │
│ email    │ bounce@bad.com       │ Hard bounce    │ 3 days ago │
└──────────┴──────────────────────┴────────────────┴────────────┘
```

## 📊 Viewing Your Contacts

Navigate to: **http://localhost:3000/contacts**

### Contact List View

```
┌──────────────────────────────────────────────────────────────┐
│ Contacts                              [Import CSV] ──────►    │
├──────────────┬────────┬────────┬──────────┬───────┬──────────┤
│ Email        │ First  │ Last   │ Company  │ Title │ Created  │
├──────────────┼────────┼────────┼──────────┼───────┼──────────┤
│ john@acme... │ John   │ Smith  │ Acme ... │ CEO   │ 2 min... │
│ sarah@tec... │ Sarah  │ John.. │ TechCo   │ VP S..│ 2 min... │
│ mike@star... │ Mike   │ Davis  │ Start... │ Found │ 2 min... │
└──────────────┴────────┴────────┴──────────┴───────┴──────────┘

Showing 3 of 3 contacts (most recent first)
```

**Features:**
- Most recent contacts shown first
- Limited to 100 contacts (pagination coming soon)
- Click "Import CSV" to add more contacts
- All fields visible in table

## 🔄 Re-importing Contacts

What happens when you import the same CSV twice?

### First Import
```
CSV: 3 contacts
Database: 0 contacts

Result:
✅ Inserted: 3
   Skipped: 0
   Suppressed: 0
```

### Second Import (Same CSV)
```
CSV: 3 contacts
Database: 3 contacts (from first import)

Result:
✅ Inserted: 0
   Skipped: 3  ← All already exist!
   Suppressed: 0
```

**Why this is good:**
- ✅ No duplicate contacts
- ✅ Safe to re-import
- ✅ Idempotent operation

## 📋 Real-World Examples

### Example 1: Conference Leads

You collected 50 business cards at a conference:

**conference_leads.csv**
```csv
Email,First Name,Last Name,Company,Met At
alice@startup.io,Alice,Wang,StartupIO,Booth
bob@venture.com,Bob,Lee,Venture Cap,Networking
carol@saas.co,Carol,Kim,SaaS Co,Panel Discussion
```

**Steps:**
1. Upload CSV
2. Map: Email→Email, First Name→First Name, etc.
3. Skip "Met At" column (not supported, or add as company note)
4. Import with "By Email" deduplication
5. Result: 50 new contacts

### Example 2: Customer Export from CRM

Exporting customers from existing CRM:

**salesforce_export.csv**
```csv
Contact Email,Contact First,Contact Last,Account Name,Job Title
john.smith@enterprise.com,John,Smith,Enterprise Corp,CTO
jane.doe@bigco.com,Jane,Doe,BigCo Industries,VP Engineering
```

**Steps:**
1. Upload CSV
2. Map columns:
   - Email ← "Contact Email"
   - First name ← "Contact First"
   - Last name ← "Contact Last"
   - Company ← "Account Name"
   - Title ← "Job Title"
3. Import with deduplication
4. Result: CRM contacts now in SmartSend

### Example 3: Cleaning Suppression List

You have a bounce list to suppress:

**bounce_list.csv**
```csv
email
bounce1@bad.com
bounce2@bad.com
invalid@fake.com
```

**Steps:**
1. Go to `/suppressions` page
2. For each email, manually add OR...
3. Use API (see below)

**Bulk Add via API:**
```bash
# Read CSV and add each as suppression
while IFS=, read -r email; do
  curl -X POST http://localhost:3000/api/suppressions/add \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"email\",\"value\":\"$email\",\"reason\":\"bounce list\"}"
done < bounce_list.csv
```

## 🛠️ Advanced Usage

### API Import (Programmatic)

```typescript
const contacts = [
  { email: "api@example.com", first_name: "API", last_name: "User" }
];

const response = await fetch('/api/import-contacts/commit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    rows: contacts.map(c => ({
      "Email": c.email,
      "First Name": c.first_name,
      "Last Name": c.last_name
    })),
    mapping: {
      email: "Email",
      first_name: "First Name",
      last_name: "Last Name"
    },
    options: {
      dedupeBy: "email",
      skipSuppressed: true
    }
  })
});

const result = await response.json();
console.log(`Imported ${result.inserted} contacts`);
```

### Suppression API

```typescript
// Add suppression
await fetch('/api/suppressions/add', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'email',
    value: 'block@example.com',
    reason: 'user request'
  })
});

// List suppressions
const res = await fetch('/api/suppressions/list');
const { rows } = await res.json();
console.log(`${rows.length} suppressions active`);
```

## ❓ FAQ

### Q: What happens to invalid emails?

**A:** They're rejected and counted in the `rejected` field. Check `rejected_samples` in the API response for details.

### Q: Can I import the same contact twice?

**A:** No, the system automatically skips existing contacts. They're counted as `skipped_existing`.

### Q: What email formats are supported?

**A:** Standard RFC-compliant emails. Must contain `@`, not start/end with `@`. Examples:
- ✅ `user@example.com`
- ✅ `first.last@company.co.uk`
- ✅ `User+Tag@Example.COM` (normalized to lowercase)
- ❌ `not-an-email`
- ❌ `@nodomain.com`
- ❌ `noatsign.com`

### Q: Can I undo an import?

**A:** Currently no bulk delete. Prevention is key:
1. Preview before importing
2. Test with small batch first
3. Use test data initially

### Q: How do I update existing contacts?

**A:** Currently inserts only. Updates coming in future version. Workaround:
1. Delete old contact (manual)
2. Re-import with new data

### Q: What's the maximum file size?

**A:** Browser-limited (typically 50-100MB). For very large imports:
- Split into multiple files
- Import in batches
- Consider API import for automation

### Q: Can I import from Excel?

**A:** Export Excel to CSV first:
1. File → Save As → CSV (Comma delimited)
2. Upload the resulting CSV file

### Q: How do I export contacts?

**A:** Export feature coming soon. Workaround:
1. Query Supabase directly
2. Use Supabase dashboard export
3. Write custom script

## 🚨 Troubleshooting

### Problem: "No rows found"

**Cause:** CSV file is empty or malformed

**Solution:**
- Check file has data
- Ensure first row is headers
- Try opening in text editor to verify format

### Problem: "Mapping must include 'email' column"

**Cause:** Email column not mapped

**Solution:**
- Select email column from dropdown
- Ensure CSV has email column
- Column name must be selected (not "— Not mapped —")

### Problem: All contacts suppressed

**Cause:** Domain or emails in suppression list

**Solution:**
- Check `/suppressions` page
- Remove suppression if added by mistake
- Verify import file doesn't contain test/blocked domains

### Problem: Import takes very long

**Cause:** Large file size or network issues

**Solution:**
- Split file into smaller batches
- Check network connection
- Monitor Supabase dashboard for load

### Problem: Import shows errors in console

**Cause:** Various - check error message

**Solution:**
- Open browser DevTools (F12)
- Check Console tab for errors
- Check Network tab for failed requests
- Verify environment variables set

## 📈 Best Practices

### 1. Clean Your Data First
- Remove duplicates in CSV before upload
- Validate emails before import
- Standardize formats (company names, titles)

### 2. Test with Small Batch
- First import: 5-10 rows
- Verify data looks correct
- Then import full file

### 3. Use Suppression List
- Add bounces immediately
- Block spam traps proactively
- Honor unsubscribe requests

### 4. Regular Maintenance
- Review contacts monthly
- Clean up invalid emails
- Update suppressions

### 5. Document Your Process
- Note where contacts came from
- Track import dates
- Keep original CSV files

## 🎯 Next Steps

After importing contacts:

1. **Create a campaign** - Send your first email
2. **Set up sequences** - Automate follow-ups
3. **Configure send safety** - Set limits and ramp rates
4. **Track analytics** - Monitor opens, clicks, replies
5. **Manage replies** - Respond to incoming messages

---

**Need Help?** Check the full documentation:
- `docs/CONTACTS_IMPORT_FEATURE.md` - Complete feature docs
- `docs/QUICKSTART_CONTACTS_IMPORT.md` - Quick start guide
- `CONTACTS_IMPORT_IMPLEMENTATION_SUMMARY.md` - Technical details
