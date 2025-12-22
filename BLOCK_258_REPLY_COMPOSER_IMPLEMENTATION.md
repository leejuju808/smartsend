# Block 258 — Reply Composer v1 Implementation

## ✅ Implementation Complete

This block implements AI-powered reply composition with snippets, quick actions, and draft persistence.

## Database Changes

### 1. Snippets Table (`273_snippets.sql`)
- Creates `snippets` table for reusable canned responses
- Workspace-scoped with RLS policies
- Categories: "pricing", "intro", "objection", "scheduling"

### 2. Draft Persistence (`274_reply_threads_draft.sql`)
- Adds `draft_body` column to `reply_threads` table
- Enables per-thread draft saving

## API Routes

### `/api/replies/[threadId]/suggest` (POST)
- Generates AI reply suggestions using OpenAI
- Uses thread context, lead info, and intent classification
- Returns JSON with `suggestion` field

### `/api/replies/[threadId]/send` (POST)
- Sends reply via send_queue system
- Supports mailbox selection
- Updates thread metadata and clears draft

### `/api/snippets/list` (GET)
- Lists all snippets accessible to the user
- Workspace-scoped

## Components

### `SnippetsDropdown`
- Dropdown menu for inserting snippets
- Fetches snippets via SWR
- Shows title and category

### `ReplyComposer`
- Main composer component with:
  - AI suggestion button
  - Snippets dropdown
  - Quick action buttons (Book Call, Send Info, Not a Fit)
  - Mailbox selection
  - Draft auto-save (debounced)
  - Send functionality

## Usage Example

```tsx
import { ReplyComposer } from "@/components/replies/ReplyComposer";

function ThreadDetailPage({ threadId }: { threadId: string }) {
  const [thread, setThread] = useState(null);

  // Load thread with draft_body
  useEffect(() => {
    const loadThread = async () => {
      const { data } = await supabase
        .from("reply_threads")
        .select("*")
        .eq("id", threadId)
        .single();
      setThread(data);
    };
    loadThread();
  }, [threadId]);

  if (!thread) return <div>Loading...</div>;

  return (
    <div>
      {/* Thread messages */}
      <div>{/* Messages list */}</div>

      {/* Reply Composer */}
      <ReplyComposer 
        thread={thread} 
        onSent={() => {
          // Refresh messages, etc.
        }} 
      />
    </div>
  );
}
```

## Features

✅ AI reply suggestions based on thread context
✅ Snippet insertion from dropdown
✅ Quick action buttons (Book Call, Send Info, Not a Fit)
✅ Mailbox selection for multi-mailbox support
✅ Draft persistence (auto-saves after 1 second of inactivity)
✅ Clean, familiar UX similar to Superhuman/Gmail

## Next Steps

1. Create admin page at `/settings/snippets` for managing snippets
2. Enhance quick actions to use AI with mode parameter
3. Add template variable substitution ({{pricing_page}}, {{booking_link}})
4. Add rich text editing support
5. Add attachment support

## Environment Variables Required

- `OPENAI_API_KEY` - For AI reply suggestions

## Database Migration

Run migrations:
```bash
supabase migration up
```

Or apply manually:
- `supabase/migrations/273_snippets.sql`
- `supabase/migrations/274_reply_threads_draft.sql`









