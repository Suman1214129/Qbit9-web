/**
 * Typed access to public env flags. Next only inlines `process.env.NEXT_PUBLIC_X` when written out
 * literally, so every flag is read here by its full name and nowhere else.
 */
const bool = (v: string | undefined, fallback: boolean) => (v == null || v === "" ? fallback : v === "true" || v === "1");

export type AdapterName = "mock" | "supabase";

export const env = {
  adapter: ((process.env.NEXT_PUBLIC_QBIT9_ADAPTER as AdapterName | undefined) ?? "mock") as AdapterName,
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  devtools: bool(process.env.NEXT_PUBLIC_ENABLE_DEVTOOLS, process.env.NODE_ENV !== "production"),
  /**
   * Serves the staff console under /staff. Turn off to ship a customer-only site, or to host the
   * staff app on its own deployment later. Staff routes return 404 when false.
   */
  staffApp: bool(process.env.NEXT_PUBLIC_ENABLE_STAFF, true),
  /** SMS delivery is outside the free MVP. When false the UI offers browser alerts and email only. */
  featureSms: bool(process.env.NEXT_PUBLIC_FEATURE_SMS, false),
  /**
   * True once alerts can reach a phone with the page closed (server web push). The mock adapter
   * can only alert while the tab is open, and the copy says so instead of overpromising.
   */
  get backgroundAlerts(): boolean {
    return (process.env.NEXT_PUBLIC_QBIT9_ADAPTER ?? "mock") !== "mock";
  },
  /** Supabase client config for real backend adapter. */
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
  /** Mock only: treat every branch as open so the flow can be demoed outside banking hours. */
  mockAlwaysOpen: bool(process.env.NEXT_PUBLIC_MOCK_ALWAYS_OPEN, true),
  /** Mock only: seed a few past visits so History and stats have something to show. */
  mockSeedHistory: bool(process.env.NEXT_PUBLIC_MOCK_SEED_HISTORY, true),
} as const;
