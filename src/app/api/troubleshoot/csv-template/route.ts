export const runtime = 'edge'

export async function GET() {
  const csv = 'email,first_name,last_name,company\nuser@example.com,Alex,Lee,Sample Inc\n'
  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="smartsend_template.csv"'
    }
  })
}

