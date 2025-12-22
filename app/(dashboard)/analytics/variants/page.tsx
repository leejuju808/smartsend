import useSWR from "swr";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";

type VariantRow = {
  variant_id: string;
  preset_key: string;
  variant_name: string;
  sends: number | null;
  opens: number | null;
  clicks: number | null;
  replies: number | null;
  weight: number | null;
  open_rate: number | null;
  click_rate: number | null;
  reply_rate: number | null;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function VariantAnalytics() {
  const { data } = useSWR("/api/analytics/variants", fetcher);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Variant Performance (30d)</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <Thead>
            <Tr>
              <Th>Preset</Th>
              <Th>Variant</Th>
              <Th>Sends</Th>
              <Th>Open</Th>
              <Th>Click</Th>
              <Th>Reply</Th>
              <Th>Weight</Th>
            </Tr>
          </Thead>
          <Tbody>
            {(data?.rows as VariantRow[] | undefined)?.map((row) => (
              <Tr key={row.variant_id}>
                <Td className="font-mono">{row.preset_key}</Td>
                <Td>{row.variant_name}</Td>
                <Td>{row.sends ?? 0}</Td>
                <Td>{percent(row.open_rate)}</Td>
                <Td>{percent(row.click_rate)}</Td>
                <Td className="font-semibold">{percent(row.reply_rate)}</Td>
                <Td>{percent(row.weight, 0)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </CardContent>
    </Card>
  );
}

function percent(value: number | null | undefined, digits = 1) {
  if (value == null) return "—";
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

