import { detectObjections } from '../src/lib/objection-detector';

describe('Objection Detector', () => {
  test('detects price objections', () => {
    expect(detectObjections('This is too expensive')).toContain('price');
    expect(detectObjections('Out of our budget')).toContain('price');
    expect(detectObjections('The cost is too high')).toContain('price');
  });

  test('detects not interested objections', () => {
    expect(detectObjections('Not interested')).toContain('not_interested');
    expect(detectObjections('Pass for now')).toContain('not_interested');
    expect(detectObjections("We're good")).toContain('not_interested');
  });

  test('detects send more info objections', () => {
    expect(detectObjections('Send me more information')).toContain('send_more_info');
    expect(detectObjections('Share the deck')).toContain('send_more_info');
    expect(detectObjections('Can you send details?')).toContain('send_more_info');
  });

  test('detects bad timing objections', () => {
    expect(detectObjections('Maybe next quarter')).toContain('bad_timing');
    expect(detectObjections('We are busy right now')).toContain('bad_timing');
    expect(detectObjections('Circle back later')).toContain('bad_timing');
  });

  test('detects already using objections', () => {
    expect(detectObjections('We already have a tool')).toContain('already_using');
    expect(detectObjections('Already using something similar')).toContain('already_using');
    expect(detectObjections('Have a solution for this')).toContain('already_using');
  });

  test('detects who are you objections', () => {
    expect(detectObjections('Who are you?')).toContain('who_are_you');
    expect(detectObjections('What do you do?')).toContain('who_are_you');
    expect(detectObjections('What is SmartSendAI?')).toContain('who_are_you');
  });

  test('detects multiple objections in one message', () => {
    const message = 'This is too expensive and we are busy right now';
    const objections = detectObjections(message);
    expect(objections).toContain('price');
    expect(objections).toContain('bad_timing');
    expect(objections.length).toBe(2);
  });

  test('handles empty or null input', () => {
    expect(detectObjections('')).toEqual([]);
    expect(detectObjections(null as any)).toEqual([]);
    expect(detectObjections(undefined as any)).toEqual([]);
  });

  test('handles case insensitive matching', () => {
    expect(detectObjections('TOO EXPENSIVE')).toContain('price');
    expect(detectObjections('Not Interested')).toContain('not_interested');
    expect(detectObjections('SEND ME INFO')).toContain('send_more_info');
  });
}); 