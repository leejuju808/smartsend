export function getIntentColor(intent: string): string {
  switch (intent) {
    case "hot_lead":
      return "bg-red-100 text-red-800 border-red-300";
    case "warm_lead":
      return "bg-orange-100 text-orange-800 border-orange-300";
    case "price_question":
      return "bg-blue-100 text-blue-800 border-blue-300";
    case "follow_up_required":
      return "bg-yellow-100 text-yellow-800 border-yellow-300";
    case "not_interested":
      return "bg-gray-100 text-gray-600 border-gray-300";
    case "referral":
      return "bg-purple-100 text-purple-800 border-purple-300";
    case "appointment_request":
      return "bg-green-100 text-green-800 border-green-300";
    case "general":
      return "bg-slate-100 text-slate-800 border-slate-300";
    default:
      return "bg-gray-100 text-gray-600 border-gray-300";
  }
}

export function getIntentLabel(intent: string): string {
  switch (intent) {
    case "hot_lead":
      return "Hot Lead";
    case "warm_lead":
      return "Warm Lead";
    case "price_question":
      return "Price Question";
    case "follow_up_required":
      return "Pressure Needed";
    case "not_interested":
      return "Not Interested";
    case "referral":
      return "Referral";
    case "appointment_request":
      return "Appointment";
    case "general":
      return "General";
    default:
      return "Unknown";
  }
}


































