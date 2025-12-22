import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe('Template Marketplace', () => {
  let testTemplateId: string;

  beforeAll(async () => {
    // Create a test template
    const { data, error } = await supabase
      .from('templates')
      .insert({
        title: 'Test Template',
        body: 'Hello {{name}}, this is a test template.',
        variables: ['name'],
        tags: ['test', 'demo'],
        visibility: 'public',
        owner_id: '00000000-0000-0000-0000-000000000000' // Test user ID
      })
      .select()
      .single();

    if (error) throw error;
    testTemplateId = data.id;
  });

  afterAll(async () => {
    // Clean up test template
    if (testTemplateId) {
      await supabase
        .from('templates')
        .delete()
        .eq('id', testTemplateId);
    }
  });

  it('should list public templates', async () => {
    const { data, error } = await supabase
      .from('templates')
      .select('id, title, tags, updated_at')
      .eq('visibility', 'public')
      .order('updated_at', { ascending: false });

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(Array.isArray(data)).toBe(true);
  });

  it('should filter templates by search query', async () => {
    const { data, error } = await supabase
      .from('templates')
      .select('id, title, tags, updated_at')
      .eq('visibility', 'public')
      .ilike('title', '%Test%')
      .order('updated_at', { ascending: false });

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(Array.isArray(data)).toBe(true);
    if (data && data.length > 0) {
      expect(data[0].title).toContain('Test');
    }
  });

  it('should filter templates by tags', async () => {
    const { data, error } = await supabase
      .from('templates')
      .select('id, title, tags, updated_at')
      .eq('visibility', 'public')
      .contains('tags', ['test'])
      .order('updated_at', { ascending: false });

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(Array.isArray(data)).toBe(true);
    if (data && data.length > 0) {
      expect(data[0].tags).toContain('test');
    }
  });

  it('should get template details', async () => {
    const { data, error } = await supabase
      .from('templates')
      .select('id, title, body, variables, tags, owner_id, updated_at')
      .eq('id', testTemplateId)
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data?.id).toBe(testTemplateId);
    expect(data?.title).toBe('Test Template');
    expect(data?.body).toBe('Hello {{name}}, this is a test template.');
    expect(data?.variables).toEqual(['name']);
    expect(data?.tags).toEqual(['test', 'demo']);
  });
}); 