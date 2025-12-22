const CLASS_LABELS = [
  "meeting_intent",
  "generic_positive",
  "question",
  "ooo",
  "unsubscribe",
  "not_interested",
  "bounce",
];

export async function GET() {
  return Response.json(CLASS_LABELS);
}
















