import { z } from "zod";

// Explicit UTC instants only (approved design) — no named-period presets
// ("today"/"this week") and no timezone conversion in this API at all;
// nothing else in this codebase does timezone math, and a future caller
// (an admin UI) that knows the browser's local timezone is the right place
// to convert "today in Europe/Stockholm" into a UTC range before calling
// this. Both optional — DashboardService resolves the approved default
// (last 30 days) when omitted, since that default is computed relative to
// "now" at request time, not a static value Zod's own `.default()` could
// express here.
export const dashboardQuerySchema = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
