# Block 278 — Lead Merge v2 Implementation

## ✅ Status: COMPLETE

This document summarizes the implementation of Lead Merge v2, a comprehensive duplicate detection and merge system for SmartSend AI.

## 📦 What Was Implemented

### 1. Database Schema (`supabase/migrations/297_lead_merge_v2.sql`)

#### Tables Created:
- **`lead_merge_events`**: Tracks all merge operations with full snapshots for undo capability
- **`lead_duplicates`**: Stores detected duplicate pairs with confidence scores

#### Columns Added to `leads`:
- `is_merged` (boolean): Flag indicating if lead has been merged
- `merged_into` (uuid): Reference to the primary lead this was merged into

#### Functions Created:
- **`detect_lead_duplicates(p_workspace_id)`**: Detects duplicates using multiple heuristics
- **`merge_leads(...)`**: Performs the merge operation with field-level control
- **`undo_lead_merge(...)`**: Undoes a merge within 7 days
- **`get_merge_preview(...)`**: Returns preview of what will be merged

#### Duplicate Detection Heuristics:
1. **Email exact match** → Score: 100
2. **LinkedIn URL exact match** → Score: 95
3. **Same domain + same first + last name** → Score: 90
4. **Same company + similar name (trigram)** → Score: 70

### 2. API Endpoints

#### `/api/leads/merge` (POST)
Merges two leads together.

**Request:**
```json
{
  "primary_lead_id": "uuid",
  "merged_lead_id": "uuid",
  "field_selections": {
    "title": "primary" | "merged",
    "phone": "primary" | "merged",
    ...
  }
}
```

**Response:**
```json
{
  "success": true,
  "merge_event_id": "uuid",
  "message": "Leads merged successfully"
}
```

#### `/api/leads/merge/preview` (GET)
Preview what will be merged before confirming.

**Query Parameters:**
- `primary_lead_id`: UUID of primary lead
- `merged_lead_id`: UUID of lead to be merged

**Response:**
```json
{
  "preview": {
    "primary_lead": {...},
    "merged_lead": {...},
    "deals": [...],
    "threads_count": 5,
    "notes_count": 3,
    "tasks_count": 2,
    "send_logs_count": 10,
    "activity_count": 25
  }
}
```

#### `/api/leads/merge/undo` (POST)
Undoes a merge (within 7 days).

**Request:**
```json
{
  "merge_event_id": "uuid"
}
```

#### `/api/leads/duplicates` (GET)
Lists duplicate leads for a workspace.

**Query Parameters:**
- `min_score`: Minimum confidence score (default: 70)
- `reviewed`: Filter by reviewed status ('true', 'false', or undefined)

**Response:**
```json
{
  "duplicates": [
    {
      "id": "uuid",
      "lead_id": "uuid",
      "duplicate_lead_id": "uuid",
      "score": 90,
      "match_type": "domain_name",
      "lead": {...},
      "duplicate_lead": {...}
    }
  ]
}
```

#### `/api/leads/duplicates` (POST)
Manually trigger duplicate detection for a workspace.

### 3. Security & Permissions

- **RLS Policies**: All tables have proper Row Level Security policies
- **Role Enforcement**: Only workspace owners/admins can merge leads
- **Workspace Isolation**: All operations are workspace-scoped

### 4. Background Jobs

- **Cron Job**: Duplicate detection runs daily at 2 AM UTC for all workspaces
- **Manual Trigger**: Admins can trigger duplicate detection via API

## 🔄 Merge Flow

### Step 1: Choose Primary Lead
- User selects which lead should be the primary (kept)
- System suggests primary based on:
  - Most recent activity
  - Higher score
  - More data filled in

### Step 2: Field-Level Preview
- Shows side-by-side comparison of all fields
- User can choose which value wins for each field:
  - `"primary"`: Keep primary lead's value
  - `"merged"`: Use merged lead's value

### Step 3: Linked Objects Preview
- Shows counts of:
  - Messages/threads
  - Deals (with stages)
  - Notes
  - Tasks
  - Lead Activity entries

### Step 4: Confirm & Merge
- Creates snapshot of merged lead
- Updates all foreign keys:
  - `deals.lead_id`
  - `reply_threads.lead_id`
  - `lead_activity.lead_id`
  - `tasks.lead_id`
  - `notes.lead_id`
  - `send_logs.lead_id`
  - `email_events.lead_id` (if exists)
- Marks merged lead as `is_merged = true`
- Creates merge event record
- Logs team activity

### Step 5: Undo (if needed)
- Available for 7 days after merge
- Restores merged lead row
- Moves links back (only those originally on merged lead)
- Logs undo activity

## 📊 Data Integrity

### What Gets Merged:
- ✅ All deals → Primary lead
- ✅ All threads → Primary lead
- ✅ All notes → Primary lead
- ✅ All tasks → Primary lead
- ✅ All activity → Primary lead
- ✅ All send logs → Primary lead
- ✅ All email events → Primary lead

### What Gets Preserved:
- ✅ Full snapshot of merged lead in `lead_merge_events.snapshot`
- ✅ Original lead row (soft-deleted, not hard-deleted)
- ✅ All activity history
- ✅ All analytics remain accurate

## 🎯 Usage Examples

### Detect Duplicates
```bash
# Trigger detection manually
curl -X POST /api/leads/duplicates \
  -H "x-workspace-id: <workspace_id>"

# List duplicates
curl /api/leads/duplicates?min_score=80 \
  -H "x-workspace-id: <workspace_id>"
```

### Preview Merge
```bash
curl "/api/leads/merge/preview?primary_lead_id=<id>&merged_lead_id=<id>" \
  -H "x-workspace-id: <workspace_id>"
```

### Merge Leads
```bash
curl -X POST /api/leads/merge \
  -H "x-workspace-id: <workspace_id>" \
  -H "Content-Type: application/json" \
  -d '{
    "primary_lead_id": "<id>",
    "merged_lead_id": "<id>",
    "field_selections": {
      "title": "merged",
      "phone": "primary"
    }
  }'
```

### Undo Merge
```bash
curl -X POST /api/leads/merge/undo \
  -H "x-workspace-id: <workspace_id>" \
  -H "Content-Type: application/json" \
  -d '{
    "merge_event_id": "<id>"
  }'
```

## 🚀 Next Steps (UI Implementation)

The backend is complete. To finish the feature, implement:

1. **Duplicates View** (`/leads/duplicates`)
   - List all duplicate pairs
   - Filter by score, reviewed status
   - Bulk merge actions

2. **Merge Wizard UI**
   - Step 1: Choose primary lead
   - Step 2: Field-level comparison with toggle switches
   - Step 3: Preview linked objects
   - Step 4: Confirm merge

3. **Lead Detail Page Updates**
   - Show "Possible Duplicates" badge if duplicates exist
   - Show "Merged into..." banner if lead is merged
   - Link to merge wizard

4. **Leads List Updates**
   - "Duplicates (2)" link for leads with duplicates
   - Multi-select → "Merge selected" action
   - Filter for "Possible Duplicates"

5. **Company 360 Updates**
   - Collapse merged leads in People tab
   - "Show merged" toggle

## 📝 Notes

- Duplicate detection runs automatically daily at 2 AM UTC
- Merges can be undone within 7 days
- All merges are logged in `team_activity` feed
- Analytics remain accurate after merge (all activity attributed to primary lead)
- RLS ensures workspace isolation

## ✅ Block 278 — Lead Merge v2 SHIPPED








