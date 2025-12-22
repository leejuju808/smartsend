# Block 19840 — Inbox Full-Thread AI Reply Assistant v1

## Implementation Summary

This block implements a comprehensive AI-powered reply assistant for the SmartSend inbox, giving roofing owners the ability to generate expert replies instantly with tone control, one-click sending, and intelligent context understanding.

## ✅ Completed Features

### 1. Database Schema (`supabase/migrations/20250130000002_ai_reply_assistant_v1.sql`)

**Tables Created:**
- `ai_reply_settings` - User preferences for tone, signature, and AI behavior
- `ai_reply_logs` - Audit log of all AI-generated replies for improvement and safety
- `ai_follow_up_suggestions` - AI-generated follow-up reply suggestions for scheduling

**Key Features:**
- Tone preferences (friendly, direct, professional, laid-back, insurance-heavy, sales-optimized)
- Signature configuration (name, company, phone, scheduling link, address)
- AI behavior controls (auto-detect reply type, objection handling, follow-up suggestions)
- Pricing estimate settings (optional)
- Comprehensive logging with confidence scores and context snapshots
- RLS policies for security

### 2. AI Reply Generation API (`app/api/inbox/ai-reply/route.ts`)

**Endpoint:** `POST /api/inbox/ai-reply`

**Features:**
- Analyzes entire thread context (not just last message)
- Detects 6 reply types:
  1. **Scheduling Reply** - "When can you come out?"
  2. **Info Request Reply** - Missing address, phone, insurance info
  3. **Price Shopper Reply** - "How much is it?"
  4. **Insurance Claim Reply** - Mentions adjuster, claim, deductible
  5. **Low-Interest Reply** - Hesitant or distant tone
  6. **Urgent Damage Reply** - Leak, water damage, storm event
- Objection handling for "too expensive", "let me think", etc.
- Tone-aware reply generation
- Automatic signature appending
- Follow-up suggestion generation
- Confidence scoring
- Comprehensive logging

**Reply Type Detection:**
- Uses keyword matching and context analysis
- Detects urgency levels (low, medium, high, urgent)
- Identifies tone (polite, urgent, hesitant, distant)
- Confidence scores (0-1) for each detection

### 3. UI Components

**AIReplyButton Component** (`src/components/inbox/AIReplyButton.tsx`)
- "AI Reply" button with loading states
- Error handling and display
- Triggers AI reply generation

**AIReplyComposer Component** (`src/components/inbox/AIReplyButton.tsx`)
- Displays generated reply with reply type badge
- "Send" button for one-click sending
- "Edit Then Send" button for manual editing
- "Cancel" button to dismiss
- Inline editing mode

### 4. Inbox Integration (`app/(dashboard)/inbox/page.tsx`)

**Features:**
- AI Reply button integrated into reply composer
- AI reply composer appears when reply is generated
- Manual reply input still available
- Seamless integration with existing send flow
- Auto-populates textarea with AI reply
- Clears AI reply when user manually edits

### 5. Settings Page (`app/(dashboard)/settings/ai-reply/page.tsx`)

**Configuration Options:**
- **Reply Tone** - 6 tone options with visual selection
- **Signature Settings** - Toggle signature inclusion, configure owner/company info
- **Contact Info** - Phone, scheduling link, address (all optional)
- **AI Behavior** - Auto-detect, objection handling, follow-up suggestions
- **Pricing Estimates** - Optional price range configuration

**Features:**
- Loads existing settings on mount
- Saves settings with upsert (creates or updates)
- Form validation
- Clear visual hierarchy
- Responsive design

### 6. Logging API (`app/api/inbox/ai-reply/log/route.ts`)

**Endpoint:** `POST /api/inbox/ai-reply/log`

**Features:**
- Updates AI reply log when user edits or sends
- Tracks whether reply was edited
- Tracks whether reply was sent
- Stores edited version for analysis

## 🎯 Reply Types & Examples

### 1. Scheduling Reply
**Trigger:** "When can you come out?", "What's your availability?"
**Example:**
```
Hi [Name],

I'd be happy to come out and take a look! I have availability tomorrow at 10 AM or Thursday afternoon — what works best for you?

We can do a free inspection and walk you through what we find.
```

### 2. Info Request Reply
**Trigger:** Missing address, phone, insurance info
**Example:**
```
Hi [Name],

Could you send your full address so we can schedule your roof inspection?
```

### 3. Price Shopper Reply
**Trigger:** "How much is it?", "What's the cost?"
**Example:**
```
Hi [Name],

We'll take a look at the damage first to give you an accurate estimate. Every roof is different, so I'd like to see yours before giving you a final number.

Would you like me to come out for a free inspection?
```

### 4. Insurance Claim Reply
**Trigger:** Mentions adjuster, claim, deductible, policy
**Example:**
```
Hi [Name],

We work with insurance companies all the time. Want us to handle the paperwork for you? We can work directly with your adjuster to make sure everything goes smoothly.
```

### 5. Low-Interest Reply
**Trigger:** Hesitant or distant tone
**Example:**
```
Hi [Name],

No pressure at all — I'm here if you need help. Want me to take a quick look this week? It's free and there's no obligation.
```

### 6. Urgent Damage Reply
**Trigger:** Leak, water damage, storm event
**Example:**
```
Hi [Name],

If the leak is active, we can come out TODAY to prevent more damage. Water damage can spread quickly, so the sooner we can get it sealed up, the better.

What's your address? I'll send someone over right away.
```

### 7. Objection Handling
**Trigger:** "That's too expensive", "Let me think about it"
**Example:**
```
Hi [Name],

Totally understand — let me explain why a proper repair saves money long-term. A quick patch might seem cheaper now, but it can lead to bigger problems down the road.

We also match written estimates from other contractors. Want me to take a look and give you a detailed quote?
```

## 🔒 Safety & Logging

### Safety Features
- AI cannot send automatic messages without owner approval (v1)
- All replies require user confirmation before sending
- No sensitive data produced (no fake pricing unless user allows)
- User can edit all AI-generated replies before sending

### Logging
Every AI reply is logged with:
- Input message (last homeowner message)
- Full thread context
- Detected reply type
- Detected tone and urgency
- Generated reply
- Confidence score
- User-edited version (if edited)
- Whether reply was sent
- Settings snapshot at generation time

## 📊 Database Schema Details

### ai_reply_settings
- `user_id` (PK) - References auth.users
- `tone` - Reply tone preference
- `include_signature` - Whether to append signature
- `include_phone`, `include_scheduling_link`, `include_address` - Signature components
- `owner_name`, `company_name`, `phone`, `scheduling_link`, `address` - Signature data
- `auto_detect_reply_type` - Enable automatic reply type detection
- `enable_objection_handling` - Enable objection detection and handling
- `enable_follow_up_suggestions` - Generate follow-up suggestions
- `allow_pricing_estimates` - Allow AI to mention price ranges
- `default_price_range_min/max` - Default price range if enabled

### ai_reply_logs
- `id` (PK)
- `user_id` - User who generated the reply
- `thread_id` - Thread the reply was for
- `lead_id` - Lead the reply was for
- `input_message` - Last homeowner message
- `full_thread_context` - Full conversation history (JSON)
- `detected_reply_type` - Type detected by AI
- `detected_tone` - Tone detected
- `detected_urgency` - Urgency level
- `generated_reply` - AI-generated reply text
- `confidence_score` - AI confidence (0-1)
- `user_edited_version` - User's edited version (if edited)
- `was_sent` - Whether reply was sent
- `was_edited` - Whether user edited before sending
- `model_version` - AI model version used
- `processing_time_ms` - Generation time
- `settings_snapshot` - User settings at generation time (JSON)

### ai_follow_up_suggestions
- `id` (PK)
- `user_id` - User who owns the suggestion
- `thread_id` - Thread the suggestion is for
- `lead_id` - Lead the suggestion is for
- `suggestion_type` - Type of follow-up (24_hour, 3_day, check_in, etc.)
- `suggested_message` - Suggested follow-up message
- `suggested_send_at` - When to send
- `status` - pending, scheduled, sent, cancelled
- `scheduled_task_id` - Link to tasks table if scheduled

## 🚀 Usage

### For Users

1. **Configure Settings** (First Time)
   - Go to Settings → AI Reply
   - Set your tone preference
   - Configure signature information
   - Enable/disable features as needed

2. **Generate AI Reply**
   - Open a conversation in the inbox
   - Click "AI Reply" button
   - Review the generated reply
   - Click "Send" to send immediately, or "Edit Then Send" to customize

3. **Edit Before Sending**
   - Click "Edit" or "Edit Then Send"
   - Modify the reply as needed
   - Click "Save Changes" then "Send"

### For Developers

**Generate AI Reply:**
```typescript
const response = await fetch("/api/inbox/ai-reply", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    thread_id: "thread-uuid",
    // OR
    lead_id: "lead-uuid",
  }),
});

const { reply, reply_type, confidence_score } = await response.json();
```

**Update Log:**
```typescript
await fetch("/api/inbox/ai-reply/log", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    log_id: "log-uuid",
    edited_reply: "edited text",
    was_sent: true,
  }),
});
```

## 🔮 Future Enhancements

1. **Multi-Message Context Understanding**
   - Better understanding of full conversation history
   - Track what was promised
   - Identify open loops and unanswered questions

2. **Advanced Objection Handling**
   - More objection types
   - Personalized responses based on lead history
   - A/B testing of objection responses

3. **Automatic Follow-Up Scheduling**
   - Auto-schedule follow-up messages
   - Integration with task system
   - Smart timing based on lead behavior

4. **Model Fine-Tuning**
   - Use logged data to improve AI
   - Custom models per user/company
   - Industry-specific optimizations

5. **Analytics Dashboard**
   - Reply type distribution
   - Confidence score trends
   - Edit rate analysis
   - Conversion tracking

## 📝 Notes

- All AI replies require user approval before sending (v1)
- Pricing estimates are optional and disabled by default
- Follow-up suggestions are generated but not auto-sent
- Logging is comprehensive for future model improvement
- Settings are per-user, not per-workspace (can be extended)

## 🎉 Benefits

This feature gives roofing companies:
- **Time Savings** - Instant expert replies
- **Professionalism** - Consistent, expert-sounding messages
- **Speed** - Respond faster than competitors
- **Confidence** - Handle objections and questions expertly
- **Scalability** - Handle more conversations with same team
- **Quality** - Reduce typos and awkward phrasing
- **Trust** - Professional communication builds homeowner trust



















































