export default function DevDocs(){
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">SmartSend API</h1>
      <p>Authenticate with <code>Authorization: Bearer &lt;API_KEY&gt;</code></p>
      <div className="border rounded-xl p-4">
        <h2 className="font-medium mb-2">Create a send job</h2>
        <pre className="bg-gray-50 p-3 rounded text-sm overflow-x-auto">
{`POST /api/v1/jobs
Authorization: Bearer SK...

{
  "to": "alex@acme.com",
  "subject": "Hi Alex",
  "html": "<p>Hi!</p>",
  "scheduledAt": "2025-10-24T19:30:00Z",
  "campaignId": "optional-campaign-uuid"
}`}
        </pre>
      </div>
      <div className="border rounded-xl p-4">
        <h2 className="font-medium mb-2">Upsert contact</h2>
        <pre className="bg-gray-50 p-3 rounded text-sm overflow-x-auto">
{`POST /api/v1/contacts
Authorization: Bearer SK...

{
  "email": "alex@acme.com",
  "first_name": "Alex",
  "company": "Acme",
  "listId": "your-list-uuid"
}`}
        </pre>
      </div>
    </div>
  );
}