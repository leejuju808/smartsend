# Sequence Optimization System

This document describes the sequence optimization system that tracks AI versions per step for A/B testing and audit purposes.

## Database Schema

### sequence_step_versions Table
Tracks all AI-generated variants for sequence steps:
- `id`: UUID primary key
- `sequence_id`: Reference to sequences table
- `step_id`: Reference to sequence_steps table
- `step_no`: Step number (for quick lookup)
- `owner_scope`: 'user' or 'org'
- `owner_id`: User or org UUID
- `kind`: Type of optimization ('optimize', 'rewrite', 'shorten', 'expand', 'tone')
- `params`: JSONB with optimization parameters (tone, length, persona, goal)
- `subject`: Optimized subject line
- `body_md`: Optimized body (markdown)
- `created_by`: User who triggered the optimization
- `created_at`: Timestamp

### sequence_steps Enhancements
Added fields for quick UI cues:
- `ai_score`: 0-100 heuristic score
- `ai_notes`: Brief reason for the score
- `last_optimized_at`: Timestamp of last optimization

## API Routes

### 1. Optimize Entire Sequence
`POST /api/sequences/[sequenceId]/optimize`

Optimizes all steps in a sequence using default rules or custom rules.

**Request Body:**
```json
{
  "owner_scope": "user" | "org",
  "owner_id": "uuid",
  "rules": [
    {
      "step_no": 1,
      "tone": "punchy",
      "length": "short",
      "persona": "founder",
      "goal": "pattern break + clear value"
    }
  ],
  "variant_count": 2,
  "spam_safety": true,
  "spintax": false
}
```

**Default Rules:**
- Step 1: punchy, short, founder, "pattern break + clear value"
- Step 2: professional, medium, founder, "social proof + value"
- Step 3: warm, short, ae, "gentle bump"
- Step 4: neutral, medium, consultant, "case study angle"
- Step 5: casual, short, sdR, "last nudge + opt-out"

**Response:**
```json
{
  "results": [
    {
      "step_id": "uuid",
      "step_no": 1,
      "ok": true,
      "status": "ok"
    }
  ]
}
```

### 2. Optimize Single Step
`POST /api/sequences/steps/[stepId]/optimize`

Generates variants for a single step.

**Request Body:**
```json
{
  "owner_scope": "user" | "org",
  "owner_id": "uuid",
  "subject": "optional subject override",
  "body_md": "body content",
  "params": {
    "tone": "professional",
    "length": "medium",
    "persona": "founder",
    "variant_count": 3,
    "spam_safety": true,
    "add_unsubscribe": true
  },
  "keep_variables": ["first_name", "company", "my_name", "title", "domain"]
}
```

**Response:**
```json
{
  "versions": [
    {
      "id": "uuid",
      "params": {},
      "subject": "optimized subject",
      "body_md": "optimized body",
      "created_at": "timestamp"
    }
  ]
}
```

### 3. Update Step (with Scoring)
`PATCH /api/sequences/steps/[stepId]/update`

Updates a step and automatically calculates AI score.

**Request Body:**
```json
{
  "subject_template": "new subject",
  "body_md": "new body"
}
```

**Response:**
```json
{
  "ok": true,
  "step": {
    "id": "uuid",
    "step_number": 1,
    "subject_template": "new subject",
    "body_md": "new body",
    "ai_score": 85,
    "ai_notes": "Good (Subject length ideal; First line concise; Contains personalization variables)",
    "last_optimized_at": "timestamp"
  },
  "score": {
    "score": 85,
    "notes": "Good (Subject length ideal; First line concise; Contains personalization variables)"
  }
}
```

## UI Components

### SequenceOptimizer
Component for optimizing all steps in a sequence.

**Props:**
- `sequenceId`: UUID of the sequence
- `ownerScope`: 'user' | 'org'
- `ownerId`: UUID of owner

**Usage:**
```tsx
import { SequenceOptimizer } from '@/components/sequences/SequenceOptimizer'

<SequenceOptimizer 
  sequenceId={sequence.id}
  ownerScope="org"
  ownerId={orgId}
/>
```

### StepOptimizer
Component for optimizing a single step with variant comparison.

**Props:**
- `step`: Step object with `id`, `subject_template`, `body_md`, `step_number`
- `ownerScope`: 'user' | 'org'
- `ownerId`: UUID of owner

**Usage:**
```tsx
import { StepOptimizer } from '@/components/sequences/StepOptimizer'

<StepOptimizer 
  step={step}
  ownerScope="org"
  ownerId={orgId}
/>
```

## Integration Example

```tsx
'use client'

import { SequenceOptimizer } from '@/components/sequences/SequenceOptimizer'
import { StepOptimizer } from '@/components/sequences/StepOptimizer'

export default function SequenceEditor({ sequenceId, orgId }: { 
  sequenceId: string
  orgId: string 
}) {
  const [steps, setSteps] = useState([])

  // Load steps...

  return (
    <div className="space-y-4">
      {/* Sequence-level optimizer */}
      <SequenceOptimizer 
        sequenceId={sequenceId}
        ownerScope="org"
        ownerId={orgId}
      />

      {/* Per-step optimizers */}
      {steps.map(step => (
        <StepOptimizer
          key={step.id}
          step={step}
          ownerScope="org"
          ownerId={orgId}
        />
      ))}
    </div>
  )
}
```

## Heuristic Scoring

The scoring system evaluates steps on a 0-100 scale:

1. **Subject Length** (0-15 points)
   - 20-45 chars: +10 points
   - < 60 chars: +5 points

2. **First Line** (0-10 points)
   - ≤ 120 chars: +10 points

3. **Spam Detection** (0-10 points)
   - No spammy words: +10 points

4. **Variables** (0-10 points)
   - Contains {{variables}}: +10 points

5. **CTA** (0-10 points)
   - Clear CTA (1-2): +10 points

6. **Unsubscribe** (0-5 points)
   - Includes opt-out: +5 points

**Badge Levels:**
- 80-100: "Good"
- 60-79: "Okay"
- 0-59: "Poor"

## Environment Variables

The system supports external template rewrite endpoints:

- `TEMPLATE_REWRITE_URL`: External edge function URL for rewrites
- `CRON_SECRET`: Secret for external API authentication

If `TEMPLATE_REWRITE_URL` is not set, the system falls back to the internal `/api/templates/rewrite` endpoint.

## Features

1. **Version Tracking**: All AI-generated variants are saved to `sequence_step_versions` for audit and A/B testing
2. **Automatic Scoring**: Steps are scored automatically when updated via the API
3. **RLS Security**: Version access respects org/user scope
4. **Variable Preservation**: All optimization preserves {{variables}} like {{first_name}}, {{company}}
5. **Spam Safety**: Options to avoid spammy words and maintain CAN-SPAM compliance
6. **Multi-variant Generation**: Can generate 1-5 variants per step

## QA Checklist

✅ "Optimize all" generates variants for every step using default rules
✅ Variables remain intact ({{first_name}}, {{company}}, etc.)
✅ Step 1 outputs are short & punchy; later steps trend more value-oriented
✅ Spam-safe mode reduces exclamations and SHOUTING
✅ Steps with empty subject/body still produce reasonable drafts
✅ Org/user scope respected for version access
✅ Scores appear after applying variants
✅ High-level badge (Good/Okay/Poor) displays in the list
✅ Rollback: old content available via sequence_step_versions

