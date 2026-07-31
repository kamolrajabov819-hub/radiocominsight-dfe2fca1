import type { Cell, SheetRows, TabName } from "./sheets.functions";

/* ------------------------------------------------------------------ *
 * Primitive coercions
 *
 * The spreadsheet is written by Supermetrics and edited by hand, so the
 * same column can arrive as a number, a formatted string, or a blank.
 * Everything below is deliberately forgiving.
 * ------------------------------------------------------------------ */

export function toNum(v: Cell | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  // Strips thousands separators (comma, apostrophe, and regular / narrow /
  // non-breaking spaces) plus currency and percent marks before parsing.
  const s = String(v)
    .replace(/[\s\u00a0\u202f,']/g, "")
    .replace(/[%$\u20ac\u20bd]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function toStr(v: Cell | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

const pad2 = (n: number | string) => String(n).padStart(2, "0");

/**
 * Google Sheets hands dates back in three different shapes depending on the
 * render option in play: an ISO string, a locale string, or a serial number
 * counting days from 1899-12-30. Accept all of them.
 */
export function toDateISO(v: Cell | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;

  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 1000 || v > 100000) return null;
    const d = new Date(Math.round((v - 25569) * 86_400_000));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  const s = String(v).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;

  const slash = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    // Sheets defaults to M/D/YYYY; flip when the first part cannot be a month.
    const [month, day] = a > 12 ? [b, a] : [a, b];
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${slash[3]}-${pad2(month)}-${pad2(day)}`;
  }

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}/.test(s)) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Quarters
 *
 * Every tab reports on calendar quarters, but they disagree about how to
 * spell them (and one Google Ads block has a typo'd end date). Collapsing
 * every row onto the quarter of its *start* date is what makes a single
 * global period filter work across all six channels.
 * ------------------------------------------------------------------ */

export type Quarter = {
  key: string; // 2026-Q1
  label: string; // Q1 2026
  short: string; // Q1 '26
  start: string; // 2026-01-01
  stop: string; // 2026-03-31
  year: number;
  q: number;
};

const QUARTER_END = ["03-31", "06-30", "09-30", "12-31"];

export function quarterFromISO(iso: string | null): Quarter | null {
  if (!iso) return null;
  const [y, m] = iso.split("-");
  const year = Number(y);
  const month = Number(m);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  const q = Math.floor((month - 1) / 3) + 1;
  return {
    key: `${year}-Q${q}`,
    label: `Q${q} ${year}`,
    short: `Q${q} '${String(year).slice(2)}`,
    start: `${year}-${pad2((q - 1) * 3 + 1)}-01`,
    stop: `${year}-${QUARTER_END[q - 1]}`,
    year,
    q,
  };
}

export function compareQuarters(a: string, b: string) {
  return a.localeCompare(b);
}

/* ------------------------------------------------------------------ *
 * Header-driven column lookup
 *
 * Column positions in this workbook have already moved once. Resolving
 * every metric by its header text means a future reshuffle degrades to a
 * missing metric instead of silently reading the wrong column.
 * ------------------------------------------------------------------ */

type ColMap = Record<string, number>;

/**
 * Header keys are matched on letters and digits only, punctuation collapsed
 * to single spaces. The character class has to be Unicode-aware: three tabs
 * in this workbook (Sales, Google Analytics, OLX) have Cyrillic headers, and
 * an `[a-z0-9]` class erases them completely — every such header normalises
 * to "" and drops out of the map, silently taking header-based column
 * resolution with it.
 */
const normKey = (c: Cell | undefined) =>
  toStr(c)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%]+/gu, " ")
    .trim();

function headerMap(row: Cell[]): ColMap {
  const map: ColMap = {};
  row.forEach((cell, i) => {
    const key = normKey(cell);
    if (key && !(key in map)) map[key] = i;
  });
  return map;
}

/** Exact header match first, then a substring match, then a fixed fallback. */
function col(map: ColMap, names: string[], fallback: number): number {
  for (const n of names) {
    if (n in map) return map[n];
  }
  const keys = Object.keys(map);
  for (const n of names) {
    const hit = keys.find((k) => k.includes(n));
    if (hit) return map[hit];
  }
  return fallback;
}

/* ------------------------------------------------------------------ *
 * Meta Ads
 * ------------------------------------------------------------------ */

export type MetaRow = {
  quarter: string;
  label: string;
  short: string;
  dateStart: string;
  dateStop: string;
  clicks: number;
  impressions: number;
  reach: number;
  spend: number;
  leads: number;
  reportedCostPerLead: number;
  pageLikes: number;
  contentViews: number;
  videoWatches25: number;
  videoWatches50: number;
  videoWatches75: number;
  videoWatches100: number;
  postEngagement: number;
  messagingConversations: number;
};

const META_FALLBACK = {
  clicks: 2,
  impressions: 3,
  reach: 4,
  spend: 5,
  leads: 6,
  cpl: 7,
  pageLikes: 8,
  contentViews: 9,
  v25: 10,
  v50: 11,
  v75: 12,
  v100: 13,
  postEngagement: 17,
  messaging: 18,
};

export function parseMetaAds(rows: SheetRows): MetaRow[] {
  const out: MetaRow[] = [];
  let map: ColMap = {};

  for (const r of rows) {
    if (!r || !r.length) continue;
    if (normKey(r[0]) === "date start") {
      map = headerMap(r);
      continue;
    }
    const startISO = toDateISO(r[0]);
    const quarter = quarterFromISO(startISO);
    if (!startISO || !quarter) continue;

    const at = (names: string[], fallback: number) => toNum(r[col(map, names, fallback)]);

    out.push({
      quarter: quarter.key,
      label: quarter.label,
      short: quarter.short,
      dateStart: startISO,
      dateStop: toDateISO(r[1]) ?? quarter.stop,
      clicks: at(["click all", "clicks"], META_FALLBACK.clicks),
      impressions: at(["impressions"], META_FALLBACK.impressions),
      reach: at(["reach"], META_FALLBACK.reach),
      spend: at(["amount spent", "spend"], META_FALLBACK.spend),
      leads: at(["leads total", "leads"], META_FALLBACK.leads),
      reportedCostPerLead: at(["cost per leads total"], META_FALLBACK.cpl),
      pageLikes: at(["page likes"], META_FALLBACK.pageLikes),
      contentViews: at(["content views"], META_FALLBACK.contentViews),
      videoWatches25: at(["video watches at 25%"], META_FALLBACK.v25),
      videoWatches50: at(["video watches at 50%"], META_FALLBACK.v50),
      videoWatches75: at(["video watches at 75%"], META_FALLBACK.v75),
      videoWatches100: at(["video watches at 100%"], META_FALLBACK.v100),
      postEngagement: at(["post engagement"], META_FALLBACK.postEngagement),
      messagingConversations: at(
        ["messaging conversations started", "messaging conversations"],
        META_FALLBACK.messaging,
      ),
    });
  }

  return out.sort((a, b) => compareQuarters(a.quarter, b.quarter));
}

/* ------------------------------------------------------------------ *
 * Google Ads
 *
 * Layout quirk: the tab is a stack of five-row blocks. Row 1 of a block
 * is the header, rows 2-5 are one campaign network each, and the block's
 * date range floats in columns A/B on whichever row Supermetrics landed
 * it. Reading column A as "the date" (as the previous parser did) picks
 * up an all-zero row, which is why this page rendered zeros.
 * ------------------------------------------------------------------ */

export type GoogleAdsNetwork = "Search" | "Display & other";

export type GoogleAdsRow = {
  quarter: string;
  label: string;
  short: string;
  dateStart: string;
  dateStop: string;
  network: GoogleAdsNetwork;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  phoneCalls: number;
  interactions: number;
  searchImpressionSharePct: number;
  videoViews: number;
  engagements: number;
};

const GA_ADS_FALLBACK = {
  impressions: 2,
  clicks: 3,
  cost: 4,
  conversions: 5,
  phoneCalls: 6,
  interactions: 7,
  sis: 8,
  videoViews: 9,
  engagements: 13,
};

const isGoogleAdsHeader = (row: Cell[]) =>
  row.some((c) => normKey(c) === "impressions") && row.some((c) => normKey(c) === "average cpc");

export function parseGoogleAds(rows: SheetRows): GoogleAdsRow[] {
  const out: GoogleAdsRow[] = [];
  let i = 0;

  while (i < rows.length) {
    if (!rows[i] || !isGoogleAdsHeader(rows[i])) {
      i += 1;
      continue;
    }
    const map = headerMap(rows[i]);
    const block: Cell[][] = [];
    let j = i + 1;
    while (j < rows.length && !isGoogleAdsHeader(rows[j])) {
      block.push(rows[j] ?? []);
      j += 1;
    }

    // The date range lives somewhere in columns A/B of the block.
    let startISO: string | null = null;
    let stopISO: string | null = null;
    for (const r of block) {
      const s = toDateISO(r[0]);
      if (s) {
        startISO = s;
        stopISO = toDateISO(r[1]);
        break;
      }
    }
    const quarter = quarterFromISO(startISO);

    if (quarter) {
      const at = (r: Cell[], names: string[], fallback: number) =>
        toNum(r[col(map, names, fallback)]);

      const candidates = block
        .map((r) => ({
          impressions: at(r, ["impressions"], GA_ADS_FALLBACK.impressions),
          clicks: at(r, ["clicks"], GA_ADS_FALLBACK.clicks),
          cost: at(r, ["cost"], GA_ADS_FALLBACK.cost),
          conversions: at(r, ["all conversions", "conversions"], GA_ADS_FALLBACK.conversions),
          phoneCalls: at(r, ["phone calls"], GA_ADS_FALLBACK.phoneCalls),
          interactions: at(r, ["interactions"], GA_ADS_FALLBACK.interactions),
          // Stored as a 0-1 fraction in the sheet.
          searchImpressionSharePct: at(r, ["search impression share"], GA_ADS_FALLBACK.sis) * 100,
          videoViews: at(r, ["video views"], GA_ADS_FALLBACK.videoViews),
          engagements: at(r, ["engagements"], GA_ADS_FALLBACK.engagements),
        }))
        .filter((m) => m.impressions > 0 || m.clicks > 0 || m.cost > 0);

      for (const m of candidates) {
        out.push({
          quarter: quarter.key,
          label: quarter.label,
          short: quarter.short,
          dateStart: quarter.start,
          dateStop:
            stopISO && stopISO >= quarter.start && stopISO <= quarter.stop ? stopISO : quarter.stop,
          // Search impression share is only reported for the search network,
          // which is the one signal in the sheet that separates the rows.
          network: m.searchImpressionSharePct > 0 ? "Search" : "Display & other",
          ...m,
        });
      }
    }

    i = j;
  }

  return out.sort((a, b) => compareQuarters(a.quarter, b.quarter));
}

/* ------------------------------------------------------------------ *
 * Organic (Facebook / Instagram)
 *
 * One `metric | value` pair per period, laid out left to right across the
 * sheet. Header cells read "Start date YYYY-MM-DD\nEnd date YYYY-MM-DD".
 * ------------------------------------------------------------------ */

export type OrganicPeriod = {
  quarter: string;
  label: string;
  short: string;
  dateStart: string;
  dateStop: string;
  metrics: Record<string, number>;
};

function parseOrganicHeader(v: Cell) {
  const s = toStr(v);
  const m = s.match(/start date\s*(\S+)[\s\S]*?end date\s*(\S+)/i);
  if (!m) return null;
  const start = toDateISO(m[1]);
  const stop = toDateISO(m[2]);
  if (!start) return null;
  return { start, stop: stop ?? start };
}

export function parseOrganic(rows: SheetRows): OrganicPeriod[] {
  if (!rows.length) return [];
  const header = rows[0] ?? [];

  const blocks: { col: number; period: OrganicPeriod }[] = [];
  for (let c = 0; c < header.length; c++) {
    const h = parseOrganicHeader(header[c]);
    if (!h) continue;
    const quarter = quarterFromISO(h.start);
    if (!quarter) continue;
    blocks.push({
      col: c,
      period: {
        quarter: quarter.key,
        label: quarter.label,
        short: quarter.short,
        dateStart: h.start,
        dateStop: h.stop,
        metrics: {},
      },
    });
  }

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.length) continue;
    for (const b of blocks) {
      const name = toStr(row[b.col]);
      if (!name) continue;
      b.period.metrics[name] = toNum(row[b.col + 1]);
    }
  }

  return blocks.map((b) => b.period).sort((a, b) => compareQuarters(a.quarter, b.quarter));
}

/**
 * Follower counts and library sizes are point-in-time readings — summing
 * them across quarters produces nonsense. These are carried forward from
 * the latest period instead.
 */
const SNAPSHOT_METRIC = /(followers|media count|profile media)/i;
export const isSnapshotMetric = (name: string) => SNAPSHOT_METRIC.test(name);

/* ------------------------------------------------------------------ *
 * OLX
 * ------------------------------------------------------------------ */

export type OlxProduct = {
  name: string;
  category: string;
  price: number;
  adId: string;
  views: number;
  favorites: number;
  phoneClicks: number;
  extra: number;
  ctrPct: number;
};

export function parseOlx(rows: SheetRows): OlxProduct[] {
  const out: OlxProduct[] = [];
  for (const r of rows) {
    if (!r) continue;
    const name = toStr(r[0]);
    // The final row of the tab is an unlabelled totals row.
    if (!name || normKey(r[0]) === "name") continue;
    const views = toNum(r[4]);
    const phoneClicks = toNum(r[6]);
    out.push({
      name,
      category: toStr(r[1]) || "Uncategorised",
      price: toNum(r[2]),
      adId: toStr(r[3]),
      views,
      favorites: toNum(r[5]),
      phoneClicks,
      extra: toNum(r[7]),
      // The sheet's own CTR column is percent-formatted, so its raw value
      // depends on the render option. Deriving it keeps the unit stable.
      ctrPct: views > 0 ? (phoneClicks / views) * 100 : 0,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Google Analytics / SEO
 *
 * A hand-assembled tab: a metric list on the left (columns A-F) and a
 * keyword table on the right (columns H-U), both in Russian.
 * ------------------------------------------------------------------ */

export type GaUnit = "count" | "percent" | "rank" | "duration" | "none";

export type GaMetric = {
  source: string;
  metric: string;
  raw: string;
  display: string;
  note: string;
  value: number | null;
  unit: GaUnit;
  changePct: number | null;
  changeRaw: string;
};

export type GaKeyword = {
  keyword: string;
  kd: number | null;
  position: number | null;
  volume: number;
  intent: string;
  cpc: number;
  url: string;
  traffic: number;
  trafficSharePct: number;
};

function parseGaValue(raw: string, metric: string): { value: number | null; unit: GaUnit } {
  const s = raw.trim();
  if (!s || /^n\/?a$/i.test(s)) return { value: null, unit: "none" };
  if (s.endsWith("%")) {
    const n = Number(s.replace(/[%\s,]/g, ""));
    return { value: Number.isFinite(n) ? n : null, unit: "percent" };
  }
  const n = Number(s.replace(/[\s,]/g, ""));
  if (!Number.isFinite(n)) return { value: null, unit: "none" };
  if (/rank|ранг|место/i.test(metric)) return { value: n, unit: "rank" };
  if (/duration|длительн|duration|мин/i.test(metric)) return { value: n, unit: "duration" };
  return { value: n, unit: "count" };
}

export function parseGoogleAnalytics(rows: SheetRows): {
  metrics: GaMetric[];
  keywords: GaKeyword[];
} {
  const metrics: GaMetric[] = [];
  const keywords: GaKeyword[] = [];
  let keywordTableClosed = false;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;

    const source = toStr(r[0]);
    const metric = toStr(r[1]);
    if (source && metric) {
      const raw = toStr(r[2]);
      const changeRaw = toStr(r[3]);
      const { value, unit } = parseGaValue(raw, metric);
      const changeNum = changeRaw ? Number(changeRaw.replace(/[%\s,]/g, "")) : NaN;
      metrics.push({
        source,
        metric,
        raw,
        display: toStr(r[5]) || raw,
        note: toStr(r[4]),
        value,
        unit,
        changePct: changeRaw.includes("%") && Number.isFinite(changeNum) ? changeNum : null,
        changeRaw,
      });
    }

    const kw = toStr(r[7]);
    if (!kw || keywordTableClosed) continue;
    // A second, differently-shaped table starts further down the column.
    if (/ключевое слово|keyword/i.test(kw)) {
      keywordTableClosed = true;
      continue;
    }
    if (/^итого|^total/i.test(kw)) continue;

    const position = Number(toStr(r[9]).replace(/[^\d.]/g, ""));
    const kd = Number(toStr(r[8]).replace(/[^\d.]/g, ""));
    keywords.push({
      keyword: kw,
      kd: Number.isFinite(kd) ? kd : null,
      position: Number.isFinite(position) ? position : null,
      volume: toNum(r[10]),
      intent: toStr(r[11]),
      cpc: toNum(r[14]),
      url: toStr(r[15]),
      traffic: toNum(r[16]),
      trafficSharePct: toNum(r[17]),
    });
  }

  return { metrics, keywords };
}

export const GA_INTENT_LABELS: Record<string, string> = {
  I: "Informational",
  N: "Navigational",
  C: "Commercial",
  T: "Transactional",
};

/* ------------------------------------------------------------------ *
 * Sales
 *
 * A CRM pipeline export (Russian headers). Two stages are present:
 * "Договор" (contract issued, «Ожидает» — still open) and "Выиграна"
 * («Выиграно» — the customer bought).
 *
 * The tab is grouped, so each stage is preceded by a subtotal row whose
 * stage cell reads "Договор (387)" and whose other identity columns are
 * blank; a trailing blank row closes the sheet. Those are bookkeeping, not
 * deals, and the totals they carry are what the parser is checked against:
 * Договор 3,221,026,785.69 and Выиграна 1,075,705,357.23.
 *
 * `Источник` is the acquisition source, and it is the column that ties
 * revenue back to the marketing channels on the rest of the dashboard —
 * OLX, Radiocom.uz and Instagram all appear in it.
 * ------------------------------------------------------------------ */

export type SaleOutcome = "won" | "open" | "lost";

export type SaleRow = {
  stage: string;
  outcome: SaleOutcome;
  /** Verbatim from the sheet; "" when the cell is blank. */
  source: string;
  /**
   * Who bought. `Название компании` is blank on roughly half the rows — it
   * only holds registered entities — so `Контакт`, which is never blank,
   * is the name to show. `company` keeps the registered name when there is
   * one, for the rows where the two differ.
   */
  customer: string;
  company: string;
  /** Expected revenue, in UZS. */
  revenue: number;
  manager: string;
  tag: string;
  probabilityPct: number;
};

const SALES_FALLBACK = {
  stage: 0,
  probability: 1,
  currency: 3,
  outcome: 6,
  opportunity: 8,
  revenue: 9,
  contact: 10,
  contactName: 11,
  company: 12,
  source: 13,
  tag: 14,
  manager: 28,
};

function saleOutcome(v: string): SaleOutcome {
  const s = v.toLowerCase();
  if (s.includes("выигр") || s.includes("won")) return "won";
  if (s.includes("проигр") || s.includes("потер") || s.includes("lost")) return "lost";
  return "open";
}

/** A grouped-export subtotal: 'Договор (387)' with nothing else on the row. */
const isSubtotalStage = (stage: string) => /\(\s*\d+\s*\)\s*$/.test(stage);

export function parseSales(rows: SheetRows): SaleRow[] {
  if (!rows.length) return [];
  const map = headerMap(rows[0] ?? []);
  const at = (r: Cell[], names: string[], fallback: number) => r[col(map, names, fallback)];

  const out: SaleRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.length) continue;

    const stage = toStr(at(r, ["этап", "stage"], SALES_FALLBACK.stage));
    if (isSubtotalStage(stage)) continue;

    // `Контакт` is the only identity column present on every deal row, so a
    // row without it is the trailing blank, not a deal.
    const contact = toStr(at(r, ["контакт", "contact"], SALES_FALLBACK.contact));
    const company = toStr(at(r, ["название компании", "company name"], SALES_FALLBACK.company));
    if (!contact && !company) continue;

    const probability = toNum(at(r, ["вероятность", "probability"], SALES_FALLBACK.probability));
    out.push({
      stage,
      outcome: saleOutcome(toStr(at(r, ["выиграно потеряно", "won lost"], SALES_FALLBACK.outcome))),
      source: toStr(at(r, ["источник", "source"], SALES_FALLBACK.source)),
      customer:
        company ||
        contact ||
        toStr(at(r, ["имя контакта", "contact name"], SALES_FALLBACK.contactName)),
      company,
      revenue: toNum(at(r, ["ожидаемый доход", "expected revenue"], SALES_FALLBACK.revenue)),
      manager: toStr(at(r, ["менеджер по продажам", "salesperson"], SALES_FALLBACK.manager)),
      tag: toStr(at(r, ["теги", "tags"], SALES_FALLBACK.tag)),
      // Whole percents on deal rows, a 0-1 fraction on subtotals.
      probabilityPct: probability <= 1 ? probability * 100 : probability,
    });
  }
  return out;
}

/** Case-folded customer identity, for counting people rather than rows. */
const customerKey = (r: SaleRow) => r.customer.toLowerCase();

/**
 * Per-source roll-up, counted in deals. `share` fields are percentages of
 * the slice passed in and sum to exactly 100.
 *
 * Deliberately not counted in distinct customers: 89 buyers placed more than
 * once, and a dozen of them bought through two different sources, so any
 * per-source customer count needs an attribution rule and stops reconciling
 * with the sheet's own subtotals. The distinct-buyer figure is reported once,
 * at the top of the page, via `countCustomers`.
 */
export type SourceStat = {
  source: string;
  deals: number;
  revenue: number;
  dealSharePct: number;
  revenueSharePct: number;
};

export function salesBySource(rows: SaleRow[]): SourceStat[] {
  const agg = new Map<string, { deals: number; revenue: number }>();
  for (const r of rows) {
    const key = r.source || UNSPECIFIED_SOURCE;
    const cur = agg.get(key) ?? { deals: 0, revenue: 0 };
    agg.set(key, { deals: cur.deals + 1, revenue: cur.revenue + r.revenue });
  }
  const totalDeals = rows.length;
  const totalRevenue = rows.reduce((a, r) => a + r.revenue, 0);
  return Array.from(agg.entries())
    .map(([source, v]) => ({
      source,
      deals: v.deals,
      revenue: v.revenue,
      dealSharePct: totalDeals > 0 ? (v.deals / totalDeals) * 100 : 0,
      revenueSharePct: totalRevenue > 0 ? (v.revenue / totalRevenue) * 100 : 0,
    }))
    .sort((a, b) => b.deals - a.deals);
}

/** Distinct buyers across the rows passed in. */
export function countCustomers(rows: SaleRow[]): number {
  return new Set(rows.map(customerKey)).size;
}

/** Sentinel for a blank source cell; translated at render time. */
export const UNSPECIFIED_SOURCE = "__unspecified__";

/* ------------------------------------------------------------------ *
 * Assembly
 * ------------------------------------------------------------------ */

export type AllData = {
  meta: MetaRow[];
  google: GoogleAdsRow[];
  instagram: OrganicPeriod[];
  facebook: OrganicPeriod[];
  olx: OlxProduct[];
  ga: { metrics: GaMetric[]; keywords: GaKeyword[] };
  sales: SaleRow[];
};

export function parseAll(raw: Partial<Record<TabName, SheetRows>>): AllData {
  return {
    meta: parseMetaAds(raw["Meta Ads"] ?? []),
    google: parseGoogleAds(raw["Google Ads"] ?? []),
    instagram: parseOrganic(raw["Instagram Organic"] ?? []),
    facebook: parseOrganic(raw["Facebook Organic"] ?? []),
    olx: parseOlx(raw["OLX"] ?? []),
    ga: parseGoogleAnalytics(raw["Google Analytics"] ?? []),
    sales: parseSales(raw["Sales"] ?? []),
  };
}

/** Every quarter that appears anywhere in the workbook, oldest first. */
export function detectQuarters(data: AllData): Quarter[] {
  const seen = new Map<string, Quarter>();
  const add = (key: string) => {
    if (seen.has(key)) return;
    const [y, q] = key.split("-Q");
    const quarter = quarterFromISO(`${y}-${pad2((Number(q) - 1) * 3 + 1)}-01`);
    if (quarter) seen.set(key, quarter);
  };
  data.meta.forEach((r) => add(r.quarter));
  data.google.forEach((r) => add(r.quarter));
  data.instagram.forEach((p) => add(p.quarter));
  data.facebook.forEach((p) => add(p.quarter));
  return Array.from(seen.values()).sort((a, b) => compareQuarters(a.key, b.key));
}

/** Kept for the MCP `list_periods` tool. */
export function quarterLabel(start: string, stop: string): string {
  const q = quarterFromISO(start);
  if (q && stop >= q.start && stop <= q.stop) return q.label;
  return `${start} – ${stop}`;
}
