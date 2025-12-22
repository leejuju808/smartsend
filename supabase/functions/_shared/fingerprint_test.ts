import { assert, assertEquals } from "https://deno.land/std@0.181.0/testing/asserts.ts";
import { normalizeForHash, sha1 } from "./fingerprint.ts";

Deno.test("normalize masks dates/times", async () => {
  const { text } = normalizeForHash({
    subject: "Auto: Out of office",
    plaintext: "Out of office until Nov 18, 2025 at 10:30 AM",
  });
  assert(!/nov 18, 2025/i.test(text));
  assert(!/10:30 am/i.test(text));

  const hash = await sha1(text);
  assertEquals(hash.length, 40);
});


