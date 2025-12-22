-- ============================================================================
-- Block 22005 — SmartSend Roofing "Job Timeline 2.0" (The Unified Story of Every Lead)
-- ============================================================================
-- FULLY OVERHAULED — The Most Important Screen in SmartSend
--
-- This migration enhances the job_timelines table to support:
-- - Event categorization (communication, ai_intelligence, pipeline, etc.)
-- - AI-generated human-readable summaries
-- - Visual grouping and filtering
-- ============================================================================

-- Add event_category column
ALTER TABLE public.job_timelines
  ADD COLUMN IF NOT EXISTS event_category TEXT;

-- Add event_summary column (AI-generated human-readable summary)
ALTER TABLE public.job_timelines
  ADD COLUMN IF NOT EXISTS event_summary TEXT;

-- Create index for filtering by category
CREATE INDEX IF NOT EXISTS idx_job_timelines_event_category
  ON public.job_timelines(event_category);

-- Create index for full-text search on summaries
CREATE INDEX IF NOT EXISTS idx_job_timelines_event_summary_gin
  ON public.job_timelines USING gin(to_tsvector('english', COALESCE(event_summary, '')));

-- ============================================================================
-- Event Categories (6 Major Groups)
-- ============================================================================
-- 1. communication - Homeowner messages, estimator replies, automated follow-ups, photos, attachments
-- 2. ai_intelligence - Tone detected, intent detected, momentum update, experience score, win/loss reason, probability explanation, AI flags
-- 3. pipeline - Stage changes, estimate scheduled/completed, proposal sent/viewed, job marked won/lost
-- 4. assignment - New lead assigned, auto-routing decisions, handoff, reassignment
-- 5. risk - Medium/high/critical risk, missed follow-ups, delayed proposals
-- 6. audit - Automation triggers, system overrides, user actions, settings affecting this lead
-- ============================================================================

-- Add comment to document event categories
COMMENT ON COLUMN public.job_timelines.event_category IS 'Event category: communication, ai_intelligence, pipeline, assignment, risk, or audit';
COMMENT ON COLUMN public.job_timelines.event_summary IS 'AI-generated human-readable summary of the event for timeline display';









































