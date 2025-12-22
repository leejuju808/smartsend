// Next.js instrumentation file for Sentry
// This runs once at server startup

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Initialize Sentry for Node.js runtime
    const { init } = await import('@sentry/nextjs');
    
    init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.05'),
      debug: process.env.NODE_ENV === 'development',
      
      // Filter out sensitive data
      beforeSend(event, hint) {
        // Remove sensitive fields
        if (event.request) {
          delete event.request.cookies;
          if (event.request.headers) {
            delete event.request.headers['authorization'];
            delete event.request.headers['cookie'];
          }
        }
        return event;
      },

      // Integrations
      integrations: [
        // Add integrations as needed
      ],
    });
  }
}

