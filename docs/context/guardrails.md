# Guardrails & Coding Conventions

## Security
- All secrets only in server-side env (never shipped client).
- Strict RLS: users see only their data. Add policies for every new table.
- Stripe webhooks: verify signature, log events, handle idempotency.

## Architecture
- Next.js App Router.
- Supabase (Auth, DB), Stripe (billing), Vercel (deploy).
- API routes return typed JSON {ok:boolean, data?:T, error?:{code,msg}}.

## Quality Bar
- TypeScript strict.
- Lint passes, no warnings.
- Include happy path + 1 edge case test.
- Manual test steps documented.

## Performance
- Avoid N+1; use indexes; paginate.
- Only fetch needed fields. 