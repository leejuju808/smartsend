## Auth

- **Header**: `X-Api-Key: <your key>` (create in app: Settings → API Keys)
- **Rate limit**: 60 requests/min per key (soft; configurable later)

## Endpoints

### POST /functions/v1/api-leads-upsert

Request:

```json
{
  "email": "sarah@acme.com",
  "first_name": "Sarah",
  "company": "Acme",
  "meta": {"plan":"Gold"},
  "campaign_id": "<uuid>",
  "start_now": true
}
```

Response:

```json
{ "ok": true, "lead_id": "<uuid>" }
```

### POST /functions/v1/api-campaign-trigger

Request:

```json
{
  "campaign_id": "<uuid>",
  "lead_ids": ["<uuid>", "<uuid>"],
  "start_at": "2025-11-05T18:00:00Z"
}
```

Response:

```json
{ "ok": true, "enqueued": 2 }
```

## Inbound Webhook (optional signing)

POST raw JSON to `/functions/v1/ingest-inbound`

- **Header**: `X-Webhook-Signature: <hex hmac sha256>`
- **Body fields**: `{ billing_account_id, account_id, lead_id, from_email, to_email, subject, html, received_at?, provider_msg_id? }`

Partner signature: `hex(hmac_sha256(webhook_secret, raw_body))` → set as `X-Webhook-Signature`.

## What this unlocks

- Programmatic lead intake (Zapier, Make, forms, CSV importers)
- External triggers to start sequences
- Secure, revocable keys with scopes and expiration
- Rate-limited & logged usage tied to billing


