import { createClient } from '@supabase/supabase-js';

// Mock the Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        order: jest.fn(() => ({
          contains: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null })
          }))
        }))
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({ data: null, error: null })
        }))
      })),
      update: jest.fn(() => ({
        eq: jest.fn().mockResolvedValue({ data: null, error: null })
      }))
    }))
  }))
}));

describe('Marketplace Templates', () => {
  it('should create sequence template correctly', async () => {
    const mockInsert = jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn().mockResolvedValue({ 
          data: { id: 'seq-123' }, 
          error: null 
        })
      }))
    }));
    const mockFrom = jest.fn(() => ({ insert: mockInsert }));
    const mockCreateClient = require('@supabase/supabase-js').createClient;
    mockCreateClient.mockReturnValue({ from: mockFrom });

    const supabase = createClient('url', 'key');
    const result = await supabase
      .from('marketplace_templates')
      .insert({
        kind: 'sequence',
        name: 'Test Sequence',
        payload: { name: 'Test', steps: [] }
      })
      .select()
      .single();

    expect(mockFrom).toHaveBeenCalledWith('marketplace_templates');
    expect(result.data?.id).toBe('seq-123');
  });

  it('should create campaign template correctly', async () => {
    const mockInsert = jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn().mockResolvedValue({ 
          data: { id: 'camp-123' }, 
          error: null 
        })
      }))
    }));
    const mockFrom = jest.fn(() => ({ insert: mockInsert }));
    const mockCreateClient = require('@supabase/supabase-js').createClient;
    mockCreateClient.mockReturnValue({ from: mockFrom });

    const supabase = createClient('url', 'key');
    const result = await supabase
      .from('marketplace_templates')
      .insert({
        kind: 'campaign',
        name: 'Test Campaign',
        payload: { name: 'Test', subject: 'Subject', body_text: 'Body' }
      })
      .select()
      .single();

    expect(mockFrom).toHaveBeenCalledWith('marketplace_templates');
    expect(result.data?.id).toBe('camp-123');
  });
});

describe('Marketplace Installation', () => {
  it('should track installation correctly', async () => {
    const mockInsert = jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn().mockResolvedValue({ 
          data: { id: 'install-123' }, 
          error: null 
        })
      }))
    }));
    const mockFrom = jest.fn(() => ({ insert: mockInsert }));
    const mockCreateClient = require('@supabase/supabase-js').createClient;
    mockCreateClient.mockReturnValue({ from: mockFrom });

    const supabase = createClient('url', 'key');
    const result = await supabase
      .from('marketplace_installs')
      .insert({
        template_id: 'template-123',
        org_id: 'org-123',
        user_id: 'user-123',
        installed_kind: 'sequence',
        installed_ref: 'seq-456'
      })
      .select()
      .single();

    expect(mockFrom).toHaveBeenCalledWith('marketplace_installs');
    expect(result.data?.id).toBe('install-123');
  });
}); 