-- Block 20290 — SmartSend Inbox Conversation Profile View v1
-- Creates a view that returns all inbox_threads fields plus tags as a JSON array

-- ============================================================================
-- PART 1 — Create Conversation Profile View (with Tags)
-- ============================================================================
-- This view makes it easy to load conversation + tags in one shot
-- Returns all inbox_threads fields plus a tags JSON array for that conversation

CREATE OR REPLACE VIEW inbox_conversation_profile_view AS
SELECT
  c.*,
  COALESCE(
    (
      SELECT json_agg(
        jsonb_build_object(
          'id', t.id,
          'label', t.label,
          'color', t.color,
          'category', t.category
        )
      )
      FROM conversation_tags ct
      JOIN lead_tags t ON t.id = ct.tag_id
      WHERE ct.conversation_id = c.id
        AND t.is_active = TRUE
    ),
    '[]'::json
  ) AS tags
FROM inbox_threads c;

-- Comment for documentation
COMMENT ON VIEW inbox_conversation_profile_view IS 'View that returns all inbox_threads fields plus tags as a JSON array. Use this when loading conversations for the Inbox to get tags in one query.';

















































