# Contacts, Lists, and Bulk Email System

This implementation provides a complete system for managing contacts, organizing them into lists, and sending bulk emails with merge tag support.

## Components

### 1. Database Schema (`supabase/migrations/20250125_contacts_lists_system.sql`)

- **contacts**: Stores contact information with custom fields
- **lists**: Organizes contacts into named groups
- **list_members**: Junction table linking contacts to lists
- **v_list_active_contacts**: View that excludes suppressed contacts
- **email_jobs**: Enhanced with campaign and tracking fields

### 2. Templating System (`src/lib/templating.ts`)

Server-safe merge-tags helper that supports:
- `{{contact.first_name}}` - Contact fields
- `{{contact.custom.anyColumn}}` - Custom CSV columns
- Template validation and variable extraction

### 3. CSV Import API (`src/app/api/contacts/import-simple/route.ts`)

Imports CSV data and:
- Creates/uses a list
- Upserts contacts with deduplication
- Adds contacts to list members
- Handles custom fields in JSONB

### 4. Bulk Email Scheduling (`src/app/api/campaigns/schedule-bulk/route.ts`)

Schedules bulk emails by:
- Selecting active contacts from a list
- Rendering templates with merge tags
- Creating email jobs for the queue
- Automatically skipping suppressed contacts

## Usage Examples

### CSV Import

```bash
curl -X POST http://localhost:3000/api/contacts/import-simple \
  -H "Content-Type: application/json" \
  -d '{
    "listName": "My List",
    "csv": "email,first_name,last_name,company\njohn@example.com,John,Doe,Acme Corp"
  }'
```

### Bulk Email Scheduling

```bash
curl -X POST http://localhost:3000/api/campaigns/schedule-bulk \
  -H "Content-Type: application/json" \
  -d '{
    "listId": "list-uuid",
    "campaignId": "campaign-uuid", 
    "subjectTemplate": "Hey {{contact.first_name}}, quick question about {{contact.company}}",
    "htmlTemplate": "<h1>Hello {{contact.first_name}}!</h1><p>I hope you are doing well at {{contact.company}}.</p>",
    "scheduledAt": "2024-01-25T10:00:00Z"
  }'
```

### Template Examples

**Subject Templates:**
- `Hey {{contact.first_name}}, quick question about {{contact.company}}`
- `{{contact.first_name}}, let's discuss {{contact.custom.industry}}`

**Body Templates:**
- `Hello {{contact.first_name}} {{contact.last_name}}!`
- `I noticed you work at {{contact.company}} in {{contact.custom.role}}.`
- `Your custom field: {{contact.custom.anyColumn}}`

## Testing

Run the test script to verify the complete flow:

```bash
npx tsx scripts/test-contacts-lists-flow.ts
```

## Features

✅ **Contact Management**: Store contacts with custom fields  
✅ **List Organization**: Group contacts into named lists  
✅ **CSV Import**: Bulk import with automatic list creation  
✅ **Merge Tags**: Dynamic content with `{{contact.field}}` syntax  
✅ **Suppression Handling**: Automatically skips suppressed contacts  
✅ **Bulk Scheduling**: Queue thousands of personalized emails  
✅ **RLS Security**: Row-level security for multi-tenant data  
✅ **Performance**: Chunked operations for large datasets  

## Database Views

The `v_list_active_contacts` view automatically excludes suppressed contacts, making it easy to send only to active recipients without additional filtering logic.