import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SPREADSHEET_ID = "1_mljmLtXDrk90g055harTstt06_VvSurYuCpfrag4Vs";

/** Google's own API. Needs only an API key, and works anywhere. */
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
/** Lovable's proxy. Only usable from inside Lovable's runtime. */
const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

/**
 * UNFORMATTED_VALUE alone makes Sheets return date cells as serial numbers
 * (days since 1899-12-30). Pairing it with FORMATTED_STRING keeps numbers raw
 * while dates arrive as readable strings.
 */
const RENDER_OPTS = "valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING";

const TabName = z.enum([
  "Meta Ads",
  "Google Ads",
  "Instagram Organic",
  "Facebook Organic",
  "OLX",
  "Google Analytics",
  "Sales",
]);
export type TabName = z.infer<typeof TabName>;
export type Cell = string | number | null;
export type SheetRows = Cell[][];

export const TABS: TabName[] = [
  "Meta Ads",
  "Google Ads",
  "Instagram Organic",
  "Facebook Organic",
  "OLX",
  "Google Analytics",
  "Sales",
];

export type WorkbookResult = {
  tabs: Partial<Record<TabName, SheetRows>>;
  /** Set when the workbook could not be read; the UI shows this instead of blanking. */
  error: string | null;
  fetchedAt: string;
};

function normalize(values: unknown[][] | undefined): SheetRows {
  return (values ?? []).map((row) =>
    row.map((c) => {
      if (c === null || c === undefined) return null;
      if (typeof c === "number" || typeof c === "string") return c;
      return String(c);
    }),
  );
}

/**
 * Two ways to reach the workbook, in preference order.
 *
 * 1. GOOGLE_API_KEY — a plain Google API key against Google's own endpoint.
 *    Works on any host, which is what makes a Netlify or Vercel deploy
 *    possible; the Lovable connector only works inside Lovable's runtime.
 *    An API key can only read a spreadsheet shared as "anyone with the link
 *    can view" — Google rejects it for private files, no matter the key.
 * 2. LOVABLE_API_KEY + GOOGLE_SHEETS_API_KEY — the original connector path,
 *    kept so the Lovable-hosted preview keeps working unchanged.
 *
 * The key is read from the environment and never committed: this repository
 * is public, and a committed API key is scraped within minutes.
 */
type Source = { url: (rangesQuery: string) => string; headers?: Record<string, string> };

function resolveSource(): Source | null {
  const googleKey = process.env.GOOGLE_API_KEY;
  if (googleKey) {
    return {
      url: (q) =>
        `${SHEETS_API}/${SPREADSHEET_ID}/values:batchGet?${q}&${RENDER_OPTS}` +
        `&key=${encodeURIComponent(googleKey)}`,
    };
  }

  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (lovableKey && connKey) {
    return {
      url: (q) => `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${q}&${RENDER_OPTS}`,
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connKey,
      },
    };
  }
  return null;
}

export const getSheetTab = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ tab: TabName }).parse(input))
  .handler(async ({ data }) => {
    const source = resolveSource();
    if (!source) throw new Error("No Google Sheets credentials configured");
    const res = await fetch(source.url(`ranges=${encodeURIComponent(data.tab)}`), {
      headers: source.headers,
    });
    if (!res.ok) {
      throw new Error(`Google Sheets ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as { valueRanges?: { values?: unknown[][] }[] };
    return { tab: data.tab, values: normalize(json.valueRanges?.[0]?.values) };
  });

/** Fetches every tab in one batch. Never throws — failures come back on `error`. */
export async function fetchWorkbook(): Promise<WorkbookResult> {
  const fetchedAt = new Date().toISOString();
  const source = resolveSource();
  if (!source) {
    return {
      tabs: {},
      error:
        "Google Sheets is not configured. Set GOOGLE_API_KEY (a Google API key, with the " +
        "spreadsheet shared as “anyone with the link can view”), then reload.",
      fetchedAt,
    };
  }

  const qs = TABS.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");

  try {
    const res = await fetch(source.url(qs), { headers: source.headers });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      const hint =
        res.status === 403
          ? " The spreadsheet must be shared as “anyone with the link can view” for an API key to read it."
          : "";
      return { tabs: {}, error: `Google Sheets returned ${res.status}.${hint} ${body}`, fetchedAt };
    }
    const json = (await res.json()) as {
      valueRanges?: { range: string; values?: unknown[][] }[];
    };
    const tabs: Partial<Record<TabName, SheetRows>> = {};
    (json.valueRanges ?? []).forEach((vr, i) => {
      if (TABS[i]) tabs[TABS[i]] = normalize(vr.values);
    });
    return { tabs, error: null, fetchedAt };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown network error";
    return { tabs: {}, error: `Could not reach Google Sheets: ${msg}`, fetchedAt };
  }
}

export const getAllTabs = createServerFn({ method: "GET" }).handler(fetchWorkbook);
