# Coding Conventions

## UI/UX
- Clean, modern, responsive.
- Empty states, loading states, error states.

## API
- Zod schemas for input/output.
- 4xx for client errors, 5xx for server.
- Log error.id for traceability.

## DB
- SQL migrations with -- up/down.
- Index any column used in filters/joins.
- Enum types for constrained states (e.g., subscription_status).

## Commits
- feat(scope): summary
- fix(scope): summary
- chore, refactor, test, docs

## Testing
- Vitest + React Testing Library for UI.
- Unit tests for utils/APIs with mocks. 