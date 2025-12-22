"use client";
import { useState } from "react";
import { Copy, CheckCircle, Calendar, MessageSquare, Phone, Clock } from "lucide-react";

interface Sequence {
  id: string;
  name: string;
  niche: string;
  offer: string;
  subject: string;
  body: string;
  delay_days: number;
}

const NICHE_OFFER_SEQUENCES: Sequence[] = [
  // Speed-to-Lead for Roofers
  {
    id: "roofers-speed-to-lead",
    name: "Speed-to-Lead for Roofers",
    niche: "Roofers",
    offer: "Speed-to-Lead",
    subject: "{{company}} leads are waiting",
    body: `Quick one—are you open to a 7-day trial where form leads get a text in <60s and book straight into your calendar? Teams like {{competitor_local}} pick up 5–10 extra jobs/month just from faster replies. Worth a test?`,
    delay_days: 0
  },
  {
    id: "roofers-speed-to-lead-s2",
    name: "Speed-to-Lead Proof",
    niche: "Roofers", 
    offer: "Speed-to-Lead",
    subject: "When replies slip past 5 minutes...",
    body: `When replies slip past 5 minutes, close rates fall off a cliff. We plug into your form → instant SMS → qualify → push to a call slot. If it doesn't book more jobs in 7 days, I'll shut it off.`,
    delay_days: 2
  },
  {
    id: "roofers-speed-to-lead-s3",
    name: "Speed-to-Lead Friction Kill",
    niche: "Roofers",
    offer: "Speed-to-Lead", 
    subject: "No site changes needed",
    body: `No site changes needed. We use your existing number + calendar. Could I send a 2-min loom showing exactly how it'd work for {{company}}?`,
    delay_days: 4
  },
  {
    id: "roofers-speed-to-lead-s4",
    name: "Speed-to-Lead Nudge",
    niche: "Roofers",
    offer: "Speed-to-Lead",
    subject: "If someone already handles this...",
    body: `If someone already handles this, point me their way? Otherwise, want me to send over two time options?`,
    delay_days: 7
  },

  // 24/7 SMS Booking for Medspa/Dentist
  {
    id: "medspa-24-7-sms",
    name: "24/7 SMS Booking - Medspa",
    niche: "Medspa/Dentist",
    offer: "24/7 SMS Booking",
    subject: "Patients text after hours",
    body: `Patients text after hours. We auto-book them while you sleep (pilot?)`,
    delay_days: 0
  },
  {
    id: "medspa-24-7-sms-s2",
    name: "24/7 SMS Proof",
    niche: "Medspa/Dentist",
    offer: "24/7 SMS Booking", 
    subject: "Real clinics see 5–15 extra bookings/month",
    body: `Real clinics see 5–15 extra bookings/month—no staff time.`,
    delay_days: 2
  },
  {
    id: "medspa-24-7-sms-s3",
    name: "24/7 SMS HIPAA",
    niche: "Medspa/Dentist",
    offer: "24/7 SMS Booking",
    subject: "HIPAA-sane routing",
    body: `HIPAA-sane routing; your existing calendar; stop any time.`,
    delay_days: 4
  },
  {
    id: "medspa-24-7-sms-s4",
    name: "24/7 SMS Nudge",
    niche: "Medspa/Dentist",
    offer: "24/7 SMS Booking",
    subject: "2 slots to review",
    body: `2 slots to review: Tue 11:40a or Wed 2:10p PT?`,
    delay_days: 7
  },

  // AI Receptionist for Plumbers/Law
  {
    id: "plumbers-ai-receptionist",
    name: "AI Receptionist - Plumbers",
    niche: "Plumbers/Law",
    offer: "AI Receptionist",
    subject: "Missed calls → missed $$",
    body: `Missed calls → missed $$—want a 24/7 backup that books callbacks?`,
    delay_days: 0
  },
  {
    id: "plumbers-ai-receptionist-s2",
    name: "AI Receptionist Proof",
    niche: "Plumbers/Law",
    offer: "AI Receptionist",
    subject: "Captures 100% of phone leads",
    body: `Captures 100% of phone leads; you only handle qualified callbacks.`,
    delay_days: 2
  },
  {
    id: "plumbers-ai-receptionist-s3",
    name: "AI Receptionist Features",
    niche: "Plumbers/Law",
    offer: "AI Receptionist",
    subject: "Local number stays",
    body: `Local number stays; recordings + transcripts included.`,
    delay_days: 4
  },
  {
    id: "plumbers-ai-receptionist-s4",
    name: "AI Receptionist Demo",
    niche: "Plumbers/Law",
    offer: "AI Receptionist",
    subject: "Happy to show a live demo",
    body: `Happy to show a live demo on your line—when's good?`,
    delay_days: 7
  },

  // Social DM Responder for Medspa/Dentist
  {
    id: "medspa-social-dm",
    name: "Social DM Responder - Medspa",
    niche: "Medspa/Dentist",
    offer: "Social DM Responder",
    subject: "Answer DMs instantly",
    body: `Answer DMs instantly, capture leads, and book visits from IG/FB.`,
    delay_days: 0
  },
  {
    id: "medspa-social-dm-s2",
    name: "Social DM Proof",
    niche: "Medspa/Dentist",
    offer: "Social DM Responder",
    subject: "Never miss a DM again",
    body: `Never miss a DM again. Auto-respond, qualify, and book appointments 24/7.`,
    delay_days: 2
  },
  {
    id: "medspa-social-dm-s3",
    name: "Social DM Features",
    niche: "Medspa/Dentist",
    offer: "Social DM Responder",
    subject: "Works with your existing calendar",
    body: `Works with your existing calendar and booking system.`,
    delay_days: 4
  },
  {
    id: "medspa-social-dm-s4",
    name: "Social DM Nudge",
    niche: "Medspa/Dentist",
    offer: "Social DM Responder",
    subject: "Ready to test?",
    body: `Ready to test? I can set up a 7-day trial for {{company}}.`,
    delay_days: 7
  }
];

export default function NicheOfferSequences() {
  const [selectedNiche, setSelectedNiche] = useState<string>("all");
  const [selectedOffer, setSelectedOffer] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const niches = Array.from(new Set(NICHE_OFFER_SEQUENCES.map(s => s.niche)));
  const offers = Array.from(new Set(NICHE_OFFER_SEQUENCES.map(s => s.offer)));

  const filteredSequences = NICHE_OFFER_SEQUENCES.filter(seq => {
    const nicheMatch = selectedNiche === "all" || seq.niche === selectedNiche;
    const offerMatch = selectedOffer === "all" || seq.offer === selectedOffer;
    return nicheMatch && offerMatch;
  });

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const getOfferIcon = (offer: string) => {
    switch (offer) {
      case "Speed-to-Lead": return <Clock className="h-4 w-4" />;
      case "24/7 SMS Booking": return <MessageSquare className="h-4 w-4" />;
      case "AI Receptionist": return <Phone className="h-4 w-4" />;
      case "Social DM Responder": return <MessageSquare className="h-4 w-4" />;
      default: return <Calendar className="h-4 w-4" />;
    }
  };

  const getOfferColor = (offer: string) => {
    switch (offer) {
      case "Speed-to-Lead": return "bg-blue-50 text-blue-700 border-blue-200";
      case "24/7 SMS Booking": return "bg-green-50 text-green-700 border-green-200";
      case "AI Receptionist": return "bg-purple-50 text-purple-700 border-purple-200";
      case "Social DM Responder": return "bg-orange-50 text-orange-700 border-orange-200";
      default: return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Niche × Offer Sequences</h2>
        <p className="text-gray-600 mt-1">
          Ready-to-send cold email sequences for your target niches and offers
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Niche</label>
          <select
            value={selectedNiche}
            onChange={(e) => setSelectedNiche(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Niches</option>
            {niches.map(niche => (
              <option key={niche} value={niche}>{niche}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Offer</label>
          <select
            value={selectedOffer}
            onChange={(e) => setSelectedOffer(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Offers</option>
            {offers.map(offer => (
              <option key={offer} value={offer}>{offer}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Sequences Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSequences.map((sequence) => (
          <div key={sequence.id} className="bg-white rounded-lg border p-6 hover:shadow-md transition-shadow">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900">{sequence.name}</h3>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="text-sm text-gray-600">{sequence.niche}</span>
                  <span className="text-gray-300">•</span>
                  <span className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs border ${getOfferColor(sequence.offer)}`}>
                    {getOfferIcon(sequence.offer)}
                    <span>{sequence.offer}</span>
                  </span>
                </div>
              </div>
              <span className="text-xs text-gray-500">Day {sequence.delay_days}</span>
            </div>

            {/* Subject */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Subject</label>
              <div className="p-2 bg-gray-50 rounded text-sm font-mono">
                {sequence.subject}
              </div>
            </div>

            {/* Body */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-700 mb-1">Body</label>
              <div className="p-2 bg-gray-50 rounded text-sm">
                {sequence.body}
              </div>
            </div>

            {/* Actions */}
            <div className="flex space-x-2">
              <button
                onClick={() => copyToClipboard(`${sequence.subject}\n\n${sequence.body}`, sequence.id)}
                className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
              >
                {copiedId === sequence.id ? (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Usage Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-2">How to Use These Sequences</h3>
        <div className="text-sm text-blue-800 space-y-2">
          <p>1. <strong>Choose your niche × offer combination</strong> based on your target market</p>
          <p>2. <strong>Customize the variables</strong>: {{company}}, {{competitor_local}}, {{first_name}}, {{city}}</p>
          <p>3. <strong>Set up your sequence</strong> in SmartSend with the appropriate delays</p>
          <p>4. <strong>Track MB/100</strong> to measure success - aim for 4+ meetings per 100 replies</p>
          <p>5. <strong>Test and iterate</strong> based on which combinations perform best</p>
        </div>
      </div>
    </div>
  );
}