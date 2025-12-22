# Testing the Enhanced Sequence System

## Quick Test Steps

### 1. Create a Test Sequence
```bash
curl -X POST http://localhost:3000/api/sequences \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Drip Campaign"}'
```

### 2. Add Steps to the Sequence
Replace `{SEQUENCE_ID}` with the ID from step 1:

```bash
# Step 1: Welcome email
curl -X POST http://localhost:3000/api/sequences/{SEQUENCE_ID}/steps \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Welcome!",
    "body_text": "Thanks for signing up. We are excited to have you on board.",
    "delay_days": 0,
    "condition": "always"
  }'

# Step 2: Follow-up (only if opened)
curl -X POST http://localhost:3000/api/sequences/{SEQUENCE_ID}/steps \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Getting Started Guide",
    "body_text": "Here is how to get started with our service...",
    "delay_days": 3,
    "condition": "opened"
  }'

# Step 3: Final reminder (only if no reply)
curl -X POST http://localhost:3000/api/sequences/{SEQUENCE_ID}/steps \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Last Chance to Connect",
    "body_text": "We would love to help you get started...",
    "delay_days": 7,
    "condition": "no_reply"
  }'
```

### 3. Enroll Test Contacts
```bash
curl -X POST http://localhost:3000/api/sequences/{SEQUENCE_ID}/enroll \
  -H "Content-Type: application/json" \
  -d '{
    "emails": ["test1@example.com", "test2@example.com"]
  }'
```

### 4. Test the Sequence Runner
```bash
curl -X POST http://localhost:3000/api/sequences/run
```

### 5. Check Results
```bash
# View enrollments
curl http://localhost:3000/api/sequences/{SEQUENCE_ID}/enroll

# View steps
curl http://localhost:3000/api/sequences/{SEQUENCE_ID}/steps
```

## Expected Behavior

1. **First Run**: Step 1 sends to all enrolled contacts
2. **After 3 days**: Step 2 sends only to contacts who opened step 1
3. **After 7 days**: Step 3 sends only to contacts who didn't reply

## Database Queries

Check the database directly:

```sql
-- View all enrollments
SELECT * FROM sequence_enrollments WHERE sequence_id = '{SEQUENCE_ID}';

-- View due steps
SELECT * FROM due_sequence_steps();

-- Check sequence steps
SELECT * FROM sequence_steps WHERE sequence_id = '{SEQUENCE_ID}' ORDER BY step_number;
```

## Troubleshooting

- **Steps not sending**: Check delay_days and conditions
- **Permission errors**: Ensure RLS policies are correct
- **Email delivery**: Check email service configuration
- **Database errors**: Verify migration ran successfully 