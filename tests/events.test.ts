import { recordEvent } from '../src/lib/events';

// Mock the Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      insert: jest.fn().mockResolvedValue({ data: null, error: null })
    }))
  }))
}));

describe('Events Tracking', () => {
  it('should record events with correct parameters', async () => {
    const mockInsert = jest.fn().mockResolvedValue({ data: null, error: null });
    const mockFrom = jest.fn(() => ({ insert: mockInsert }));
    const mockCreateClient = require('@supabase/supabase-js').createClient;
    mockCreateClient.mockReturnValue({ from: mockFrom });

    await recordEvent('user-123', 'test_event', { key: 'value' });

    expect(mockFrom).toHaveBeenCalledWith('events');
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'user-123',
      event: 'test_event',
      meta: { key: 'value' }
    });
  });

  it('should handle null user ID', async () => {
    const mockInsert = jest.fn().mockResolvedValue({ data: null, error: null });
    const mockFrom = jest.fn(() => ({ insert: mockInsert }));
    const mockCreateClient = require('@supabase/supabase-js').createClient;
    mockCreateClient.mockReturnValue({ from: mockFrom });

    await recordEvent(null, 'anonymous_event', { anonymous: true });

    expect(mockInsert).toHaveBeenCalledWith({
      user_id: null,
      event: 'anonymous_event',
      meta: { anonymous: true }
    });
  });
}); 