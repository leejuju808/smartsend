// GET /v1/docs - API documentation

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth } from "@/lib/api/v1-auth";

export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const docs = {
    version: "1.0.0",
    title: "SmartSend Roofing API v1",
    description: "Read/Write API for SmartSend Roofing Platform",
    base_url: `${req.nextUrl.origin}/api/v1`,
    authentication: {
      type: "Bearer Token",
      header: "Authorization: Bearer ss_live_xxxxx or ss_test_xxxxx",
      scopes: ["read", "write"],
    },
    endpoints: {
      leads: {
        "GET /v1/roofing/leads": "List leads",
        "GET /v1/roofing/leads/:id": "Get single lead",
        "PATCH /v1/roofing/leads/:id": "Update lead",
      },
      jobs: {
        "GET /v1/roofing/jobs": "List jobs",
        "GET /v1/roofing/jobs/:id": "Get single job",
        "POST /v1/roofing/jobs": "Create job",
        "PATCH /v1/roofing/jobs/:id": "Update job",
        "GET /v1/roofing/jobs/:id/status": "Get job status",
        "PATCH /v1/roofing/jobs/:id/status": "Update job status",
      },
      quotes: {
        "GET /v1/roofing/quotes": "List quotes/proposals",
        "POST /v1/roofing/quotes": "Create quote",
      },
      crews: {
        "GET /v1/roofing/crews/assignments": "List crew assignments",
        "POST /v1/roofing/crews/assignments": "Assign crew to job",
        "POST /v1/roofing/crews/check-in": "Crew check-in",
        "POST /v1/roofing/crews/check-out": "Crew check-out",
      },
      weather: {
        "GET /v1/roofing/weather/risk": "Get weather risk for jobs",
      },
      materials: {
        "GET /v1/roofing/materials/status": "Get material status",
        "POST /v1/roofing/materials/delivery": "Record material delivery",
      },
      payments: {
        "GET /v1/roofing/payments": "List payments",
        "POST /v1/roofing/payments": "Record payment",
      },
      documents: {
        "GET /v1/roofing/documents": "List documents",
        "POST /v1/roofing/documents": "Upload document metadata",
        "GET /v1/roofing/documents/:id/secure-link": "Get secure document link",
      },
      inspections: {
        "GET /v1/roofing/inspections": "List inspections",
        "POST /v1/roofing/inspections": "Create inspection",
      },
      pipelines: {
        "GET /v1/roofing/pipelines": "List pipelines/stages",
      },
      webhooks: {
        "GET /v1/webhooks": "List webhooks",
        "POST /v1/webhooks": "Create webhook",
        "GET /v1/webhooks/:id": "Get webhook",
        "DELETE /v1/webhooks/:id": "Delete webhook",
      },
      api_keys: {
        "GET /v1/api-keys": "List API keys",
        "POST /v1/api-keys": "Create API key",
        "POST /v1/api-keys/:id/revoke": "Revoke API key",
      },
      sandbox: {
        "POST /v1/sandbox/reset": "Reset sandbox data (test/sandbox keys only)",
      },
    },
    webhook_events: [
      "lead.created",
      "lead.updated",
      "lead.replied",
      "quote.sent",
      "quote.viewed",
      "quote.approved",
      "job.created",
      "job.updated",
      "job.stage.changed",
      "crew.assigned",
      "crew.check_in",
      "crew.check_out",
      "material.delivered",
      "weather.alert",
      "payment.received",
      "warranty.generated",
      "review.received",
    ],
    rate_limits: {
      live: {
        per_minute: 60,
        per_day: 5000,
      },
      test: {
        per_minute: 600,
        per_day: 50000,
      },
      sandbox: {
        per_minute: 600,
        per_day: 50000,
      },
    },
    error_codes: {
      "400_INVALID_BODY": "Invalid request body",
      "401_INVALID_API_KEY": "Invalid or missing API key",
      "403_FORBIDDEN": "Access forbidden (missing scope or IP not whitelisted)",
      "404_NOT_FOUND": "Resource not found",
      "429_RATE_LIMIT": "Rate limit exceeded",
      "500_INTERNAL_ERROR": "Internal server error",
    },
  };

  return NextResponse.json(docs);
});
