export type MeetingIntent = {
  intent: 'meeting' | 'none';
  confidence: number; // 0..1
  reason?: string;
};

const KEYWORDS = [
  'call', 'calls', 'phone call', 'hop on a call', 'zoom', 'google meet', 'teams',
  'meeting', 'meet', 'chat', 'schedule', 'book a time', 'set up a time',
  'calendar', 'calendly', 'availability', 'available time', 'let\'s talk', "let's talk",
  'demo', 'discussion', 'conversation', 'walk through', 'show you', 'explain',
  'present', 'review', 'explore', 'go over', 'talk', 'discuss'
];

const TIME_INDICATORS = [
  'tomorrow', 'next week', 'this week', 'next month', 'today',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
  'morning', 'afternoon', 'evening', '10 min', '15 min', '20 min', '30 min', '45 min', '60 min'
];

export function detectMeetingIntent(text: string, subject: string = ''): MeetingIntent {
  const hay = `${subject}\n${text}`.toLowerCase();
  let hits = 0;
  let timeHits = 0;
  
  // Check for meeting keywords
  for (const kw of KEYWORDS) {
    if (hay.includes(kw)) hits++;
  }
  
  // Check for time indicators
  for (const time of TIME_INDICATORS) {
    if (hay.includes(time)) timeHits++;
  }
  
  // Boost confidence for multiple indicators
  if (hits >= 2) {
    return { 
      intent: 'meeting', 
      confidence: Math.min(1, 0.4 + hits * 0.15), 
      reason: 'multiple_keywords' 
    };
  }
  
  if (hits === 1 && timeHits >= 1) {
    return { 
      intent: 'meeting', 
      confidence: 0.6, 
      reason: 'keyword+time' 
    };
  }
  
  if (hits === 1) {
    return { 
      intent: 'meeting', 
      confidence: 0.4, 
      reason: 'single_keyword' 
    };
  }
  
  return { intent: 'none', confidence: 0.1 };
} 