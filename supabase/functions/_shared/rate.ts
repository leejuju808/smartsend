import { makeSb } from "./oauth.ts";

type RateRow = {
  allowed: boolean;
  tokens_left: number | null;
  capacity?: number | null;
  refill_per_sec?: number | null;
} | null;

export async function rateConsume(account_id: string, cost = 1) {
  const sb = makeSb();
  const { data, error } = await sb.rpc("rpc_rate_consume", {
    p_account_id: account_id,
    p_cost: cost,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = (Array.isArray(data) ? data[0] : data) as RateRow;

  if (!row) {
    return { allowed: false, tokens_left: 0, capacity: null, refill_per_sec: null };
  }

  const capacity = row.capacity !== undefined && row.capacity !== null ? Number(row.capacity) : null;
  const refill = row.refill_per_sec !== undefined && row.refill_per_sec !== null
    ? Number(row.refill_per_sec)
    : null;

  return {
    allowed: !!row.allowed,
    tokens_left: Number(row.tokens_left ?? 0),
    capacity,
    refill_per_sec: refill,
  };
}

