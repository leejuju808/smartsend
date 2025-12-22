### SOP: Job Logging (Non‑Negotiable)

**Policy:** If a job is won, it must be logged as a job in SmartSend.

#### What counts as “logged”

- A record exists in `roofing_jobs` for the won work.
- If the job originated from SmartSend (lead/thread/campaign/proposal/contract), it is treated as SmartSend-origin and counts in performance.

#### What happens if someone “forgets”

- When a lead is marked **won**, SmartSend automatically ensures a `roofing_jobs` record exists (system-of-record enforcement).

#### Why this exists

- Prevents “phantom wins” (claims of work that isn’t trackable).
- Makes turnover irrelevant (the business has memory).
- Makes reporting trustworthy (no origin = no credit).



