import { wantsMeeting } from '../src/lib/meeting-intent';

describe('wantsMeeting', () => {
  test('detects meeting intent with call + time', () => {
    expect(wantsMeeting('Can we set up a call next week?')).toBe(true);
    expect(wantsMeeting('I would like to meet tomorrow')).toBe(true);
    expect(wantsMeeting('Let\'s schedule a zoom call this afternoon')).toBe(true);
  });

  test('detects meeting intent with meeting + time', () => {
    expect(wantsMeeting('We should have a meeting soon')).toBe(true);
    expect(wantsMeeting('Can we meet next week?')).toBe(true);
    expect(wantsMeeting('I\'m available for a meeting today')).toBe(true);
  });

  test('detects meeting intent with schedule + time', () => {
    expect(wantsMeeting('Let\'s schedule something for tomorrow')).toBe(true);
    expect(wantsMeeting('Can you schedule a call next week?')).toBe(true);
  });

  test('detects meeting intent with chat + time', () => {
    expect(wantsMeeting('We should chat soon')).toBe(true);
    expect(wantsMeeting('Let\'s talk next week')).toBe(true);
  });

  test('rejects text without intent', () => {
    expect(wantsMeeting('Hello, how are you?')).toBe(false);
    expect(wantsMeeting('Thanks for the information')).toBe(false);
    expect(wantsMeeting('I\'ll review this later')).toBe(false);
  });

  test('rejects text without time context', () => {
    expect(wantsMeeting('I want to call you')).toBe(false);
    expect(wantsMeeting('Let\'s meet sometime')).toBe(false);
    expect(wantsMeeting('We should schedule a meeting')).toBe(false);
  });

  test('rejects text with only time context', () => {
    expect(wantsMeeting('I\'m available next week')).toBe(false);
    expect(wantsMeeting('Tomorrow works for me')).toBe(false);
    expect(wantsMeeting('I have time this afternoon')).toBe(false);
  });

  test('handles edge cases', () => {
    expect(wantsMeeting('')).toBe(false);
    expect(wantsMeeting(null as any)).toBe(false);
    expect(wantsMeeting(undefined as any)).toBe(false);
  });
}); 