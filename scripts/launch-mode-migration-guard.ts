import { LAUNCH_MODE, LAUNCH_MODE_BYPASS } from "@/lib/launch-mode";

/**
 * BLOCK 290000 — Launch Discipline v1
 * When launch mode is enabled, migrations are blocked by default.
 * Set LAUNCH_MODE_BYPASS=true to explicitly override.
 */
if (LAUNCH_MODE && !LAUNCH_MODE_BYPASS) {
  // eslint-disable-next-line no-console
  console.error(
    [
      "LAUNCH MODE: schema migrations are locked.",
      "Set LAUNCH_MODE_BYPASS=true to override (emergency only).",
    ].join("\n"),
  );
  process.exit(1);
}









