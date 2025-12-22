import ServiceTicketDetailClient from "./ServiceTicketDetailClient";

export default async function ServiceTicketDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <ServiceTicketDetailClient ticketId={params.id} />;
}
































