/** /lib/meetings/intent.test.ts **/
import { detectMeetingIntent } from "./intent";

it("detects clear meeting asks", () => {
  expect(detectMeetingIntent("Can we hop on a quick call tomorrow?")).toBe(true);
  expect(detectMeetingIntent("Share your Zoom?")).toBe(true);
});
it("ignores unrelated text", () => {
  expect(detectMeetingIntent("Thanks, send pricing.")).toBe(false);
}); 