import { injectTracking } from '../lib/tracking';

// Test the tracking injection function
describe('Email Tracking', () => {
  beforeEach(() => {
    // Mock environment variable
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  });

  test('injects tracking pixel and rewrites links', () => {
    const html = `
      <html>
        <body>
          <p>Hello world!</p>
          <a href="https://example.com">Click here</a>
          <a href="https://test.com">Another link</a>
        </body>
      </html>
    `;
    
    const messageId = 'test-message-id';
    const result = injectTracking(html, messageId);
    
    // Should contain tracking pixel
    expect(result).toContain('track-open?m=test-message-id');
    
    // Should rewrite links to track-click
    expect(result).toContain('track-click?m=test-message-id&u=https%3A//example.com');
    expect(result).toContain('track-click?m=test-message-id&u=https%3A//test.com');
    
    // Should preserve original structure
    expect(result).toContain('<p>Hello world!</p>');
  });

  test('handles HTML without body tag', () => {
    const html = '<p>Simple HTML</p><a href="https://example.com">Link</a>';
    const messageId = 'test-message-id';
    const result = injectTracking(html, messageId);
    
    // Should still add tracking pixel at the end
    expect(result).toContain('track-open?m=test-message-id');
    expect(result).toContain('track-click?m=test-message-id');
  });

  test('handles missing environment variable', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    const html = '<p>Test</p>';
    const messageId = 'test-message-id';
    const result = injectTracking(html, messageId);
    
    // Should return original HTML unchanged
    expect(result).toBe(html);
  });
});