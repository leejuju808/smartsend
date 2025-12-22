Supabase Functions environment variables

Set these in your Supabase project (Functions → Settings):

- GOOGLE_CLIENT_ID: OAuth client ID from your Google Cloud project
- GOOGLE_CLIENT_SECRET: OAuth client secret from your Google Cloud project
- MS_TENANT_ID: Microsoft Azure tenant ID
- MS_CLIENT_ID: Microsoft Azure app client ID
- MS_CLIENT_SECRET: Microsoft Azure app client secret
- GMAIL_PUBSUB_TOPIC: Gmail Pub/Sub topic (e.g., projects/your-gcp-project/topics/gmail-push)
- OUTLOOK_NOTIFY_URL: HTTPS endpoint for Microsoft push notifications (e.g., https://<project>.functions.supabase.co/inbound-outlook-webhook)
- SERVICE_WEBHOOK_SECRET: Shared secret to secure internal function calls
- SUPABASE_URL: Project URL (already present)
- SUPABASE_SERVICE_ROLE_KEY: Service role key (already present)
- CLEARBIT_KEY: API key for Clearbit enrichment (optional; omit to skip provider)
- HUNTER_KEY: API key for Hunter.io enrichment (optional)
- PEOPLEDATA_KEY: API key for People Data Labs enrichment (optional)
- BUILTWITH_KEY: API key for BuiltWith tech stack enrichment (optional)

Notes:
- Gmail provider requires a connected account row in `mailboxes` with provider='gmail'.
- Outlook provider requires a connected account row in `mailboxes` with provider='outlook'.
- Tokens are automatically refreshed via the refresh token; refresh_token may rotate and will be persisted.
- The queue worker reads `provider` and `payload` from `send_queue` rows. Ensure `payload.from_user_id` is set to the mailbox owner.
