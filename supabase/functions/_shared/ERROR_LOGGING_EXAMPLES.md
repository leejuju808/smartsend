# Error Logging Examples

**Block 23280 — SmartSend Quality & Reliability Monitoring v1**

This document shows how to update your edge functions to use the new error logging system.

## Basic Error Logging

### Before ❌
```typescript
try {
  // Your code
} catch (err) {
  console.error(err);
  return new Response(
    JSON.stringify({ error: err.message }),
    { status: 500 }
  );
}
```

### After ✅
```typescript
import { logError } from "../_shared/logError.ts";

try {
  // Your code
} catch (err) {
  await logError({
    source: "your-function-name",
    severity: "error",
    message: err instanceof Error ? err.message : String(err),
    details: {
      stack: err instanceof Error ? err.stack : undefined,
      // Add any relevant context
      user_id: userId,
      job_id: jobId,
    }
  });
  
  return new Response(
    JSON.stringify({ error: err.message }),
    { status: 500 }
  );
}
```

## Critical Errors

For critical errors that need immediate alerts:

```typescript
import { logError } from "../_shared/logError.ts";

try {
  await processPayment(jobId, amount);
} catch (err) {
  await logError({
    source: "payments",
    severity: "critical", // This will trigger instant alerts!
    message: `Payment failed for job ${jobId}`,
    details: {
      job_id: jobId,
      amount: amount,
      stripe_error: err.message,
      stack: err.stack,
    }
  });
  
  return new Response(
    JSON.stringify({ error: "Payment processing failed" }),
    { status: 500 }
  );
}
```

## Performance Metrics

### Recording Execution Time

```typescript
import { recordMetric } from "../_shared/logError.ts";

const startTime = Date.now();

try {
  const result = await processData(data);
  const duration = Date.now() - startTime;
  
  // Record successful execution
  await recordMetric("edge_function_duration_ms", duration, {
    function_name: "process-data",
    success: true,
    data_size: data.length,
  });
  
  return new Response(JSON.stringify({ result }), { status: 200 });
} catch (err) {
  const duration = Date.now() - startTime;
  
  // Record failed execution
  await recordMetric("edge_function_duration_ms", duration, {
    function_name: "process-data",
    success: false,
    error: err.message,
  });
  
  throw err;
}
```

## Using withMonitoring Wrapper

The `withMonitoring` wrapper automatically logs errors and records metrics:

```typescript
import { withMonitoring } from "../_shared/logError.ts";

// Wrap your entire function logic
const result = await withMonitoring(async () => {
  // Your function code
  const data = await fetchData();
  const processed = await processData(data);
  return processed;
}, "process-data-function");

return new Response(JSON.stringify({ result }), { status: 200 });
```

## Real-World Examples

### Example 1: Payment Processing

```typescript
import { logError, recordMetric } from "../_shared/logError.ts";

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const { job_id, amount } = await req.json();
    
    // Process payment
    const payment = await stripe.charges.create({
      amount: amount * 100,
      currency: "usd",
      // ...
    });
    
    const duration = Date.now() - startTime;
    await recordMetric("payment_processing_ms", duration, {
      success: true,
      amount: amount,
    });
    
    return new Response(JSON.stringify({ success: true, payment }), {
      status: 200,
    });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    
    // Log error
    await logError({
      source: "payments",
      severity: err.type === "StripeCardError" ? "error" : "critical",
      message: `Payment failed: ${err.message}`,
      details: {
        stripe_error_type: err.type,
        stripe_error_code: err.code,
        duration_ms: duration,
      }
    });
    
    // Record failed metric
    await recordMetric("payment_processing_ms", duration, {
      success: false,
      error: err.message,
    });
    
    return new Response(
      JSON.stringify({ error: "Payment processing failed" }),
      { status: 500 }
    );
  }
});
```

### Example 2: Document Signing

```typescript
import { logError, recordMetric } from "../_shared/logError.ts";

Deno.serve(async (req) => {
  try {
    const { document_id, signer_email } = await req.json();
    
    const startTime = Date.now();
    const result = await docusign.envelopes.create({
      // ...
    });
    const duration = Date.now() - startTime;
    
    await recordMetric("document_signing_ms", duration, {
      success: true,
      document_id: document_id,
    });
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
    });
  } catch (err: any) {
    await logError({
      source: "documents",
      severity: "critical", // Document signing failures are critical
      message: `Document signing failed for ${signer_email}`,
      details: {
        document_id: document_id,
        signer_email: signer_email,
        docusign_error: err.message,
        attempt_count: attemptCount,
      }
    });
    
    return new Response(
      JSON.stringify({ error: "Document signing failed" }),
      { status: 500 }
    );
  }
});
```

### Example 3: AI Processing

```typescript
import { logError, recordMetric, withMonitoring } from "../_shared/logError.ts";

Deno.serve(async (req) => {
  const { lead_id, message } = await req.json();
  
  try {
    const insight = await withMonitoring(async () => {
      const startTime = Date.now();
      
      // Call AI API
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: message }],
      });
      
      const duration = Date.now() - startTime;
      await recordMetric("ai_latency_ms", duration, {
        model: "gpt-4",
        success: true,
      });
      
      return response.choices[0].message.content;
    }, "ai-insights");
    
    return new Response(JSON.stringify({ insight }), { status: 200 });
  } catch (err: any) {
    await logError({
      source: "ai",
      severity: err.status === 429 ? "warning" : "error",
      message: `AI insight generation failed for lead ${lead_id}`,
      details: {
        lead_id: lead_id,
        openai_error: err.message,
        status_code: err.status,
      }
    });
    
    return new Response(
      JSON.stringify({ error: "AI processing failed" }),
      { status: 500 }
    );
  }
});
```

### Example 4: Automation Engine

```typescript
import { logError, recordMetric } from "../_shared/logError.ts";

Deno.serve(async (req) => {
  try {
    const events = await fetchAutomationEvents();
    let processed = 0;
    let failed = 0;
    const startTime = Date.now();
    
    for (const event of events) {
      try {
        await processAutomationEvent(event);
        processed++;
      } catch (err: any) {
        failed++;
        await logError({
          source: "automations",
          severity: "error",
          message: `Failed to process automation event ${event.id}`,
          details: {
            event_id: event.id,
            automation_id: event.automation_id,
            error: err.message,
          }
        });
      }
    }
    
    const duration = Date.now() - startTime;
    await recordMetric("automation_execution_time_ms", duration, {
      events_processed: processed,
      events_failed: failed,
      total_events: events.length,
    });
    
    // If too many failures, log as critical
    if (failed > events.length * 0.5) {
      await logError({
        source: "automations",
        severity: "critical",
        message: `Automation engine failing: ${failed}/${events.length} events failed`,
        details: {
          processed,
          failed,
          total: events.length,
        }
      });
    }
    
    return new Response(
      JSON.stringify({ processed, failed }),
      { status: 200 }
    );
  } catch (err: any) {
    await logError({
      source: "automations",
      severity: "critical",
      message: `Automation engine crashed: ${err.message}`,
      details: {
        stack: err.stack,
      }
    });
    
    return new Response(
      JSON.stringify({ error: "Automation engine error" }),
      { status: 500 }
    );
  }
});
```

## Best Practices

1. **Always log errors** - Don't just console.error, use `logError()`
2. **Use appropriate severity** - `critical` for payment/document failures, `error` for general failures, `warning` for recoverable issues
3. **Include context** - Add relevant IDs, user info, and error details
4. **Record metrics** - Track performance for all important operations
5. **Use withMonitoring** - For simple functions, wrap with `withMonitoring()` for automatic error logging and metrics

## Severity Guidelines

- **critical** - Payment failures, document signing failures, data loss, security breaches
- **error** - General failures, API errors, processing errors
- **warning** - Recoverable issues, rate limits, temporary failures
- **info** - Informational logs (rarely used)

## Source Naming

Use consistent source names:
- `payments` - Payment processing
- `documents` - Document signing/viewing
- `ai` - AI/ML processing
- `automations` - Automation engine
- `scheduling` - Calendar/scheduling
- `field_app` - Field app operations
- `homeowner_portal` - Homeowner portal
- `jobs` - Job management
- `materials` - Material ordering
- `email` - Email sending/receiving







































