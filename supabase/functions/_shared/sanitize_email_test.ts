import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.181.0/testing/asserts.ts";
import {
  htmlToText,
  stripQuoted,
  stripSignature,
  stripFooters,
  sanitizeEmailBody,
} from "./sanitize_email.ts";

Deno.test("htmlToText basic tags", () => {
  const t = htmlToText("<p>Hello<br>World</p>");
  assertStringIncludes(t, "Hello");
  assertStringIncludes(t, "World");
});

Deno.test("stripQuoted cuts at 'On ... wrote:'", () => {
  const s = stripQuoted("Thanks!\nOn Mon, Nov 10 John wrote:\n> hi");
  assertEquals(s.trim(), "Thanks!");
});

Deno.test("stripSignature stops at delimiter", () => {
  const s = stripSignature("Okay talk soon\n--\nJohn Doe\nCEO");
  assertEquals(s.trim(), "Okay talk soon");
});

Deno.test("stripFooters removes confidentiality", () => {
  const s = stripFooters("Core text\n\nCONFIDENTIALITY NOTICE: blah blah");
  assertEquals(s.trim(), "Core text");
});

Deno.test("sanitize pipeline prefers plaintext, collapses", () => {
  const clean = sanitizeEmailBody({
    plaintext: "Out of office until Nov 18.\n\nThanks,\n--\nJane",
    html: "<div>IGNORE</div>",
  });
  assertStringIncludes(clean.toLowerCase(), "out of office");
  assert(!/jane/i.test(clean)); // signature stripped
});

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.181.0/testing/asserts.ts";
import {
  htmlToText,
  stripQuoted,
  stripSignature,
  stripFooters,
  sanitizeEmailBody,
} from "./sanitize_email.ts";

Deno.test("htmlToText basic tags", () => {
  const t = htmlToText("<p>Hello<br>World</p>");
  assertStringIncludes(t, "Hello");
  assertStringIncludes(t, "World");
});

Deno.test("stripQuoted cuts at 'On ... wrote:'", () => {
  const s = stripQuoted("Thanks!\nOn Mon, Nov 10 John wrote:\n> hi");
  assertEquals(s.trim(), "Thanks!");
});

Deno.test("stripSignature stops at delimiter", () => {
  const s = stripSignature("Okay talk soon\n--\nJohn Doe\nCEO");
  assertEquals(s.trim(), "Okay talk soon");
});

Deno.test("stripFooters removes confidentiality", () => {
  const s = stripFooters("Core text\n\nCONFIDENTIALITY NOTICE: blah blah");
  assertEquals(s.trim(), "Core text");
});

Deno.test("sanitize pipeline prefers plaintext, collapses", () => {
  const clean = sanitizeEmailBody({
    plaintext: "Out of office until Nov 18.\n\nThanks,\n--\nJane",
    html: "<div>IGNORE</div>",
  });
  assertStringIncludes(clean.toLowerCase(), "out of office");
  assert(!/jane/i.test(clean)); // signature stripped
});
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.181.0/testing/asserts.ts";
import {
  htmlToText,
  sanitizeEmailBody,
  stripFooters,
  stripQuoted,
  stripSignature,
} from "./sanitize_email.ts";

Deno.test("htmlToText basic tags", () => {
  const t = htmlToText("<p>Hello<br>World</p>");
  assertStringIncludes(t, "Hello");
  assertStringIncludes(t, "World");
});

Deno.test("stripQuoted cuts at 'On ... wrote:'", () => {
  const s = stripQuoted("Thanks!\nOn Mon, Nov 10 John wrote:\n> hi");
  assertEquals(s.trim(), "Thanks!");
});

Deno.test("stripSignature stops at delimiter", () => {
  const s = stripSignature("Okay talk soon\n--\nJohn Doe\nCEO");
  assertEquals(s.trim(), "Okay talk soon");
});

Deno.test("stripFooters removes confidentiality", () => {
  const s = stripFooters("Core text\n\nCONFIDENTIALITY NOTICE: blah blah");
  assertEquals(s.trim(), "Core text");
});

Deno.test("sanitize pipeline prefers plaintext, collapses", () => {
  const clean = sanitizeEmailBody({
    plaintext: "Out of office until Nov 18.\n\nThanks,\n--\nJane",
    html: "<div>IGNORE</div>",
  });
  assertStringIncludes(clean.toLowerCase(), "out of office");
  assert(!/jane/i.test(clean)); // signature stripped
});


