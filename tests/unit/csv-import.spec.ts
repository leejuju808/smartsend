import { describe, it, expect, beforeEach } from 'vitest';
import { 
  normalizeEmail, 
  validateEmail, 
  detectColumnMapping, 
  parseCSV,
  validateContacts,
  prepareContactsForInsertion,
  processCSVImport
} from '@/lib/csv_import';

describe('CSV Import Library', () => {
  describe('normalizeEmail', () => {
    it('should normalize email addresses', () => {
      expect(normalizeEmail('TEST@EXAMPLE.COM')).toBe('test@example.com');
      expect(normalizeEmail('  test@example.com  ')).toBe('test@example.com');
      expect(normalizeEmail('')).toBe(null);
      expect(normalizeEmail(undefined)).toBe(null);
    });
  });

  describe('validateEmail', () => {
    it('should validate correct email formats', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name+tag@domain.co.uk')).toBe(true);
      expect(validateEmail('123@test.org')).toBe(true);
    });

    it('should reject invalid email formats', () => {
      expect(validateEmail('invalid-email')).toBe(false);
      expect(validateEmail('test@')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('test.example.com')).toBe(false);
      expect(validateEmail('')).toBe(false);
    });
  });

  describe('detectColumnMapping', () => {
    it('should detect common column variations', () => {
      const headers = ['Email', 'First Name', 'Last Name', 'Company', 'Phone'];
      const mapping = detectColumnMapping(headers);
      
      expect(mapping['Email']).toBe('email');
      expect(mapping['First Name']).toBe('first_name');
      expect(mapping['Last Name']).toBe('last_name');
      expect(mapping['Company']).toBe('company');
      expect(mapping['Phone']).toBe('phone');
    });

    it('should handle alternative column names', () => {
      const headers = ['e-mail', 'Given Name', 'Family Name', 'Organization', 'Mobile'];
      const mapping = detectColumnMapping(headers);
      
      expect(mapping['e-mail']).toBe('email');
      expect(mapping['Given Name']).toBe('first_name');
      expect(mapping['Family Name']).toBe('last_name');
      expect(mapping['Organization']).toBe('company');
      expect(mapping['Mobile']).toBe('phone');
    });
  });

  describe('parseCSV', () => {
    it('should parse valid CSV content', () => {
      const csvContent = 'email,name,company\njohn@example.com,John Doe,ACME Corp';
      const result = parseCSV(csvContent);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        email: 'john@example.com',
        name: 'John Doe',
        company: 'ACME Corp'
      });
    });

    it('should handle empty CSV', () => {
      const csvContent = 'email,name\n';
      const result = parseCSV(csvContent);
      
      expect(result).toHaveLength(0);
    });

    it('should throw error for invalid CSV', () => {
      const invalidCsv = 'invalid,csv,format\nmissing,quotes,"unclosed';
      
      expect(() => parseCSV(invalidCsv)).toThrow('Invalid CSV format');
    });
  });

  describe('validateContacts', () => {
    const columnMapping = {
      'email': 'email',
      'first_name': 'first_name',
      'last_name': 'last_name',
      'company': 'company'
    };

    it('should validate and normalize contacts', () => {
      const rows = [
        { email: 'john@example.com', first_name: 'John', last_name: 'Doe', company: 'ACME' },
        { email: 'jane@example.com', first_name: 'Jane', company: 'XYZ Corp' }
      ];

      const result = validateContacts(rows, columnMapping);
      
      expect(result.validContacts).toHaveLength(2);
      expect(result.invalidEmails).toHaveLength(0);
      expect(result.duplicatesInFile.size).toBe(0);
      expect(result.validationErrors).toHaveLength(0);
    });

    it('should detect duplicate emails within file', () => {
      const rows = [
        { email: 'john@example.com', first_name: 'John' },
        { email: 'john@example.com', first_name: 'Johnny' } // Duplicate
      ];

      const result = validateContacts(rows, columnMapping);
      
      expect(result.validContacts).toHaveLength(1);
      expect(result.duplicatesInFile.size).toBe(1);
      expect(result.duplicatesInFile.has('john@example.com')).toBe(true);
    });

    it('should detect invalid emails', () => {
      const rows = [
        { email: 'invalid-email', first_name: 'John' },
        { email: 'john@example.com', first_name: 'John' }
      ];

      const result = validateContacts(rows, columnMapping);
      
      expect(result.validContacts).toHaveLength(1);
      expect(result.invalidEmails).toHaveLength(1);
      expect(result.invalidEmails).toContain('invalid-email');
    });

    it('should handle missing email column', () => {
      const rows = [
        { name: 'John Doe', company: 'ACME' } // Missing email
      ];

      const result = validateContacts(rows, columnMapping);
      
      expect(result.validContacts).toHaveLength(0);
      expect(result.validationErrors.length).toBeGreaterThan(0);
    });
  });

  describe('prepareContactsForInsertion', () => {
    const contacts = [
      {
        email: 'john@example.com',
        first_name: 'John',
        last_name: 'Doe',
        company: 'ACME Corp',
        phone: '123-456-7890'
      }
    ];

    it('should prepare contacts for database insertion', () => {
      const result = prepareContactsForInsertion(contacts, 'user-123', 'imported');
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        user_id: 'user-123',
        email: 'john@example.com',
        name: 'John Doe',
        company: 'ACME Corp',
        custom: {
          phone: '123-456-7890'
        },
        tags: ['imported'],
        created_at: expect.any(String)
      });
    });

    it('should handle contacts without names', () => {
      const contactWithoutName = [{ email: 'test@example.com', company: 'Test Corp' }];
      const result = prepareContactsForInsertion(contactWithoutName, 'user-123');
      
      expect(result[0].name).toBeUndefined();
      expect(result[0].tags).toEqual([]);
    });

    it('should process tags correctly', () => {
      const contactWithTags = [{ 
        email: 'test@example.com', 
        tags: 'tag1,tag2;tag3|tag4' 
      }];
      const result = prepareContactsForInsertion(contactWithTags, 'user-123', 'imported');
      
      expect(result[0].tags).toEqual(['imported', 'tag1', 'tag2', 'tag3', 'tag4']);
    });
  });

  describe('processCSVImport', () => {
    const csvContent = 'email,first_name,last_name,company\njohn@example.com,John,Doe,ACME Corp\njane@example.com,Jane,Smith,XYZ Corp';
    const userId = 'user-123';

    it('should process CSV import successfully', async () => {
      const result = await processCSVImport(csvContent, userId, 'imported');
      
      expect(result.result.total_in_file).toBe(2);
      expect(result.result.valid_emails).toBe(2);
      expect(result.result.inserted).toBe(2);
      expect(result.contactsToInsert).toHaveLength(2);
    });

    it('should skip existing emails', async () => {
      const existingEmails = ['john@example.com'];
      const result = await processCSVImport(csvContent, userId, 'imported', existingEmails);
      
      expect(result.result.existing_skipped).toBe(1);
      expect(result.result.inserted).toBe(1);
      expect(result.contactsToInsert).toHaveLength(1);
    });

    it('should skip suppressed emails', async () => {
      const suppressedEmails = ['jane@example.com'];
      const result = await processCSVImport(csvContent, userId, 'imported', [], suppressedEmails);
      
      expect(result.result.suppressed_skipped).toBe(1);
      expect(result.result.inserted).toBe(1);
      expect(result.contactsToInsert).toHaveLength(1);
    });

    it('should throw error for CSV without email column', async () => {
      const invalidCsv = 'name,company\nJohn Doe,ACME Corp';
      
      await expect(processCSVImport(invalidCsv, userId))
        .rejects
        .toThrow('No email column found');
    });

    it('should throw error for empty CSV', async () => {
      const emptyCsv = 'email,name\n';
      
      await expect(processCSVImport(emptyCsv, userId))
        .rejects
        .toThrow('No rows found in CSV');
    });
  });
}); 