# Repository Map

## Core Application
- `src/app/` - Next.js App Router pages and layouts
- `src/components/` - Reusable React components
- `src/lib/` - Utility functions, database clients, API helpers
- `src/types/` - TypeScript type definitions
- `src/hooks/` - Custom React hooks

## API Routes
- `src/app/api/` - API endpoints organized by feature
- `src/app/api/ai-writing/` - AI writing assistant endpoints
- `src/app/api/webhooks/` - External webhook handlers (Stripe, etc.)

## Database
- `supabase/migrations/` - SQL migration files
- `supabase/policies/` - RLS policy definitions
- `supabase/functions/` - Database functions and triggers

## Configuration
- `.env.local` - Local environment variables
- `next.config.js` - Next.js configuration
- `tailwind.config.js` - Tailwind CSS configuration
- `tsconfig.json` - TypeScript configuration

## Testing
- `src/__tests__/` - Test files
- `vitest.config.ts` - Vitest configuration
- `cypress/` - E2E tests (if applicable)

## Documentation
- `docs/context/` - Project context and conventions
- `docs/api/` - API documentation
- `README.md` - Project overview and setup 