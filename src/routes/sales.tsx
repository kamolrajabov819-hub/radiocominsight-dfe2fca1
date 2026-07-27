import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Banknote, Handshake, Hourglass, Percent, Trophy, Wallet } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StatTile } from "@/components/stat";
import { ExportButton } from "@/components/export-button";
import { ChartFrame } from "@/components/chart-frame";
import { SectionRule, Note } from "@/components/panel";
import { DataTable, type Column } from "@/components/data-table";
import {
  ChartTooltip,
  Grid,
  HBarRanking,
  OTHER_COLOR,
  PartToWhole,
  SERIES,
  barCursor,
  sourcePalette,
  surfaceStroke,
  xAxisProps,
  yAxisProps,
} from "@/components/charts";
import { Input } from "@/components/ui/input";
import { useData } from "@/lib/data-context";
import { useI18n } from "@/lib/i18n";
import { fmtCompact, fmtInt, fmtPct, fmtSom } from "@/lib/metrics";
import { salesBySource, type SaleRow } from "@/lib/parsers";

export const Route = createFileRoute("/sales")({
  head: () => ({
    meta: [
      { title: "Sales & sources — Radiocom Insight" },
      {
        name: "description",
        content:
          "Every 2026 deal by acquisition source: share of closed sales, revenue, win rate and pipeline.",
      },
      { property: "og:title", content: "Sales & sources — Radiocom Insight" },
      {
        property: "og:description",
        content: "Which channels actually turn into paying customers.",
      },
    ],
  }),
  component: SalesPage,
});

/** Part-to-whole charts stay readable at five slices plus an "Other" bucket. */
const MAX_SLICES = 5;

/** Below this a win rate is one deal flipping between 0% and 100%. */
const MIN_DEALS_FOR_RATE = 5;

function SalesPage() {
  const { data } = useData();
  const { t, tSource } = useI18n();
  const [q, setQ] = useState("");

  const all = data.sales;

  const won = useMemo(() => all.filter((s) => s.outcome === "won"), [all]);
  const open = useMemo(() => all.filter((s) => s.outcome === "open"), [all]);

  const wonRevenue = won.reduce((a, s) => a + s.revenue, 0);
  const openRevenue = open.reduce((a, s) => a + s.revenue, 0);
  const winRate = all.length ? (won.length / all.length) * 100 : 0;
  const avgWon = won.length ? wonRevenue / won.length : 0;

  /** The headline the whole page exists for: won deals, split by source. */
  const wonBySource = useMemo(() => salesBySource(won), [won]);
  const allBySource = useMemo(() => salesBySource(all), [all]);
  const palette = useMemo(() => sourcePalette(wonBySource.map((s) => s.source)), [wonBySource]);

  const shareSlices = useMemo(() => {
    const head = wonBySource.slice(0, MAX_SLICES);
    const tail = wonBySource.slice(MAX_SLICES);
    const slices = head.map((s) => ({
      name: tSource(s.source),
      value: s.deals,
      color: palette[s.source] ?? SERIES[0],
    }));
    if (tail.length) {
      slices.push({
        name: t("sales.other", { n: tail.length }),
        value: tail.reduce((a, s) => a + s.deals, 0),
        color: OTHER_COLOR,
      });
    }
    return slices.filter((s) => s.value > 0);
  }, [wonBySource, palette, t, tSource]);

  const top = wonBySource[0];

  const revenueRanking = [...wonBySource]
    .filter((s) => s.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 9)
    .map((s) => ({ label: tSource(s.source), value: s.revenue }));

  /**
   * Win rate needs the full deal set as the denominator, not just the won
   * ones — a source with 191 deals and 108 wins converts very differently
   * from one with 404 deals and 118 wins.
   */
  const winRateBySource = useMemo(() => {
    const wonCount = new Map(wonBySource.map((s) => [s.source, s.deals]));
    return allBySource
      .filter((s) => s.deals >= MIN_DEALS_FOR_RATE)
      .map((s) => ({
        source: s.source,
        label: tSource(s.source),
        deals: s.deals,
        wonDeals: wonCount.get(s.source) ?? 0,
        openDeals: s.deals - (wonCount.get(s.source) ?? 0),
        value: ((wonCount.get(s.source) ?? 0) / s.deals) * 100,
      }))
      .sort((a, b) => b.value - a.value);
  }, [allBySource, wonBySource, tSource]);

  const byManager = useMemo(() => {
    const agg = new Map<string, { deals: number; revenue: number }>();
    won.forEach((s) => {
      const key = s.manager || t("sales.unspecified");
      const cur = agg.get(key) ?? { deals: 0, revenue: 0 };
      agg.set(key, { deals: cur.deals + 1, revenue: cur.revenue + s.revenue });
    });
    return Array.from(agg.entries())
      .map(([manager, v]) => ({ manager, ...v }))
      .sort((a, b) => b.deals - a.deals);
  }, [won, t]);

  const byIndustry = useMemo(() => {
    const agg = new Map<string, number>();
    won.forEach((s) => {
      const key = s.tag || t("sales.unspecified");
      agg.set(key, (agg.get(key) ?? 0) + 1);
    });
    return Array.from(agg.entries())
      .map(([industry, deals]) => ({ industry, deals }))
      .sort((a, b) => b.deals - a.deals);
  }, [won, t]);

  const topDeals = [...won]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 12)
    .map((s) => ({
      label: shorten(s.company || stripOpportunityPrefix(s.opportunity)),
      value: s.revenue,
    }));

  const rows = useMemo(() => {
    const needle = q.toLowerCase().trim();
    if (!needle) return all;
    return all.filter(
      (s) =>
        s.company.toLowerCase().includes(needle) ||
        s.opportunity.toLowerCase().includes(needle) ||
        s.source.toLowerCase().includes(needle) ||
        s.manager.toLowerCase().includes(needle),
    );
  }, [all, q]);

  const columns: Column<SaleRow>[] = [
    {
      key: "company",
      header: t("sales.company"),
      cell: (s) => <span title={s.company}>{shorten(s.company, 40) || "—"}</span>,
      sortValue: (s) => s.company,
    },
    {
      key: "opportunity",
      header: t("sales.opportunity"),
      cell: (s) => (
        <span className="text-muted-foreground" title={s.opportunity}>
          {shorten(stripOpportunityPrefix(s.opportunity), 34) || "—"}
        </span>
      ),
      sortValue: (s) => s.opportunity,
    },
    {
      key: "source",
      header: t("sales.source"),
      cell: (s) => tSource(s.source),
      sortValue: (s) => tSource(s.source),
    },
    {
      key: "outcome",
      header: t("sales.outcome"),
      cell: (s) => <OutcomeChip outcome={s.outcome} />,
      sortValue: (s) => s.outcome,
    },
    {
      key: "revenue",
      header: t("sales.revenue"),
      numeric: true,
      cell: (s) => fmtSom(s.revenue),
      sortValue: (s) => s.revenue,
    },
    {
      key: "manager",
      header: t("sales.manager"),
      cell: (s) => <span className="text-muted-foreground">{s.manager || "—"}</span>,
      sortValue: (s) => s.manager,
    },
    {
      key: "tag",
      header: t("sales.industry"),
      cell: (s) => <span className="text-muted-foreground">{s.tag || "—"}</span>,
      sortValue: (s) => s.tag,
    },
  ];

  const sheets = [
    {
      name: "Sales by source",
      rows: [
        ["Source", "Won deals", "Share of won %", "Won revenue (so'm)", "All deals", "Win rate %"],
        ...wonBySource.map((s) => {
          const total = allBySource.find((a) => a.source === s.source)?.deals ?? s.deals;
          return [
            s.source,
            s.deals,
            s.dealSharePct,
            s.revenue,
            total,
            total ? (s.deals / total) * 100 : 0,
          ] as (string | number)[];
        }),
      ],
    },
    {
      name: "Deals",
      rows: [
        [
          "Company",
          "Opportunity",
          "Source",
          "Outcome",
          "Stage",
          "Revenue (so'm)",
          "Salesperson",
          "Industry",
        ],
        ...all.map(
          (s) =>
            [
              s.company,
              s.opportunity,
              s.source,
              s.outcome,
              s.stage,
              s.revenue,
              s.manager,
              s.tag,
            ] as (string | number)[],
        ),
      ],
    },
  ];

  return (
    <AppShell
      title={t("sales.title")}
      subtitle={t("sales.subtitle")}
      showFilter={false}
      actions={<ExportButton filename="radiocom-sales" sheets={sheets} />}
    >
      <SectionRule
        label={t("sales.pipeline")}
        note={t("sales.dealCount", { n: fmtInt(all.length) })}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile accent label={t("sales.wonDeals")} value={fmtInt(won.length)} icon={Trophy} />
        <StatTile
          label={t("sales.wonRevenue")}
          value={fmtCompact(wonRevenue)}
          sub={fmtSom(wonRevenue)}
          icon={Banknote}
        />
        <StatTile label={t("sales.openDeals")} value={fmtInt(open.length)} icon={Hourglass} />
        <StatTile
          label={t("sales.openRevenue")}
          value={fmtCompact(openRevenue)}
          sub={fmtSom(openRevenue)}
          icon={Wallet}
        />
        <StatTile
          label={t("sales.winRate")}
          value={fmtPct(winRate, 1)}
          sub={t("sales.winRateHint")}
          icon={Percent}
        />
        <StatTile
          label={t("sales.avgDeal")}
          value={fmtCompact(avgWon)}
          sub={fmtSom(avgWon)}
          icon={Handshake}
        />
      </div>

      <Note>{t("sales.notQuarterly")}</Note>

      <SectionRule
        label={t("sales.bySource")}
        note={
          top
            ? t("sales.headline", {
                pct: fmtPct(top.dealSharePct, 1),
                source: tSource(top.source),
              })
            : undefined
        }
      />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <ChartFrame
          title={t("sales.shareOfSales")}
          hint={t("sales.shareOfSalesHint")}
          legend={shareSlices.map((s) => ({ label: s.name, color: s.color }))}
          table={{
            columns: [
              { key: "source", header: t("sales.source") },
              { key: "deals", header: t("sales.wonDeals"), numeric: true },
              { key: "share", header: t("sales.share"), numeric: true },
              { key: "revenue", header: t("sales.revenue"), numeric: true },
            ],
            rows: wonBySource.map((s) => ({
              source: tSource(s.source),
              deals: fmtInt(s.deals),
              share: fmtPct(s.dealSharePct, 1),
              revenue: fmtSom(s.revenue),
            })),
          }}
          empty={shareSlices.length ? undefined : t("sales.noWon")}
        >
          <PartToWhole
            data={shareSlices}
            format={(v) => fmtInt(v)}
            centerValue={fmtInt(won.length)}
            centerLabel={t("sales.wonDeals")}
            height={258}
          />
        </ChartFrame>

        <ChartFrame
          title={t("sales.revenueBySource")}
          hint={t("sales.revenueBySourceHint")}
          table={{
            columns: [
              { key: "source", header: t("sales.source") },
              { key: "revenue", header: t("sales.revenue"), numeric: true },
              { key: "share", header: t("sales.share"), numeric: true },
            ],
            rows: wonBySource.map((s) => ({
              source: tSource(s.source),
              revenue: fmtSom(s.revenue),
              share: fmtPct(s.revenueSharePct, 1),
            })),
          }}
          empty={revenueRanking.length ? undefined : t("sales.noWon")}
        >
          <HBarRanking
            data={revenueRanking}
            color={SERIES[1]}
            seriesName={t("sales.revenue")}
            format={(v) => fmtCompact(v)}
            labelWidth={150}
          />
        </ChartFrame>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <ChartFrame
          title={t("sales.winRateBySource")}
          hint={t("sales.winRateBySourceHint")}
          note={t("sales.winRateNote", { n: MIN_DEALS_FOR_RATE })}
          table={{
            columns: [
              { key: "source", header: t("sales.source") },
              { key: "deals", header: t("sales.deals"), numeric: true },
              { key: "won", header: t("sales.won"), numeric: true },
              { key: "rate", header: t("sales.winRate"), numeric: true },
            ],
            rows: winRateBySource.map((s) => ({
              source: s.label,
              deals: fmtInt(s.deals),
              won: fmtInt(s.wonDeals),
              rate: fmtPct(s.value, 1),
            })),
          }}
          empty={winRateBySource.length ? undefined : t("sales.noData")}
        >
          <HBarRanking
            data={winRateBySource.map((s) => ({ label: s.label, value: s.value }))}
            color={SERIES[0]}
            seriesName={t("sales.winRate")}
            format={(v) => fmtPct(v, 1)}
            labelWidth={150}
            height={288}
          />
        </ChartFrame>

        <ChartFrame
          title={t("sales.wonVsOpen")}
          hint={t("sales.wonVsOpenHint")}
          legend={[
            { label: t("sales.won"), color: SERIES[0] },
            { label: t("sales.open"), color: SERIES[3] },
          ]}
          table={{
            columns: [
              { key: "source", header: t("sales.source") },
              { key: "won", header: t("sales.won"), numeric: true },
              { key: "open", header: t("sales.open"), numeric: true },
              { key: "deals", header: t("sales.deals"), numeric: true },
            ],
            rows: winRateBySource.map((s) => ({
              source: s.label,
              won: fmtInt(s.wonDeals),
              open: fmtInt(s.openDeals),
              deals: fmtInt(s.deals),
            })),
          }}
          empty={winRateBySource.length ? undefined : t("sales.noData")}
        >
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={winRateBySource} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <Grid />
                <XAxis dataKey="label" {...xAxisProps} />
                <YAxis {...yAxisProps} tickFormatter={(v: number) => fmtCompact(v)} />
                <ChartTooltip format={(v) => fmtInt(v)} cursor={barCursor} />
                <Bar
                  dataKey="wonDeals"
                  name={t("sales.won")}
                  stackId="deals"
                  fill={SERIES[0]}
                  stroke={surfaceStroke}
                  strokeWidth={2}
                  maxBarSize={54}
                />
                <Bar
                  dataKey="openDeals"
                  name={t("sales.open")}
                  stackId="deals"
                  fill={SERIES[3]}
                  stroke={surfaceStroke}
                  strokeWidth={2}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={54}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartFrame>
      </div>

      <Note>{t("sales.sourceNote")}</Note>

      <SectionRule label={t("sales.people")} />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <ChartFrame
          title={t("sales.byManager")}
          hint={t("sales.dealCount", { n: fmtInt(won.length) })}
          table={{
            columns: [
              { key: "manager", header: t("sales.manager") },
              { key: "deals", header: t("sales.wonDeals"), numeric: true },
              { key: "revenue", header: t("sales.revenue"), numeric: true },
            ],
            rows: byManager.map((m) => ({
              manager: m.manager,
              deals: fmtInt(m.deals),
              revenue: fmtSom(m.revenue),
            })),
          }}
          empty={byManager.length ? undefined : t("sales.noWon")}
        >
          <HBarRanking
            data={byManager.map((m) => ({ label: m.manager, value: m.deals }))}
            color={SERIES[4]}
            seriesName={t("sales.wonDeals")}
            format={(v) => fmtInt(v)}
            labelWidth={170}
            height={296}
          />
        </ChartFrame>

        <ChartFrame
          title={t("sales.byIndustry")}
          hint={t("sales.industryCount", { n: fmtInt(byIndustry.length) })}
          table={{
            columns: [
              { key: "industry", header: t("sales.industry") },
              { key: "deals", header: t("sales.wonDeals"), numeric: true },
            ],
            rows: byIndustry.map((i) => ({ industry: i.industry, deals: fmtInt(i.deals) })),
          }}
          empty={byIndustry.length ? undefined : t("sales.noWon")}
        >
          <HBarRanking
            data={byIndustry
              .slice(0, 10)
              .map((i) => ({ label: shorten(i.industry, 26), value: i.deals }))}
            color={SERIES[2]}
            seriesName={t("sales.wonDeals")}
            format={(v) => fmtInt(v)}
            labelWidth={170}
            height={296}
          />
        </ChartFrame>
      </div>

      <div className="mt-3">
        <ChartFrame
          title={t("sales.topCompanies")}
          hint={t("sales.topCompaniesHint")}
          table={{
            columns: [
              { key: "company", header: t("sales.company") },
              { key: "revenue", header: t("sales.revenue"), numeric: true },
            ],
            rows: topDeals.map((d) => ({ company: d.label, revenue: fmtSom(d.value) })),
          }}
          empty={topDeals.length ? undefined : t("sales.noWon")}
        >
          <HBarRanking
            data={topDeals}
            color={SERIES[1]}
            seriesName={t("sales.revenue")}
            format={(v) => fmtCompact(v)}
            labelWidth={240}
          />
        </ChartFrame>
      </div>

      <SectionRule
        label={t("sales.allDeals")}
        note={t("common.nOfTotal", { n: rows.length, total: all.length })}
      />
      <div className="border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-[0.9375rem] font-bold">{t("sales.allDeals")}</h2>
          <Input
            placeholder={t("sales.search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          initialSort={{ key: "revenue", dir: "desc" }}
          maxHeight="40rem"
          emptyLabel={all.length ? undefined : t("sales.noData")}
        />
      </div>
    </AppShell>
  );
}

function OutcomeChip({ outcome }: { outcome: SaleRow["outcome"] }) {
  const { t } = useI18n();
  const label =
    outcome === "won" ? t("sales.won") : outcome === "lost" ? t("sales.lost") : t("sales.open");
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className="h-2 w-2 shrink-0"
        style={{ background: outcome === "won" ? SERIES[0] : SERIES[3] }}
        aria-hidden
      />
      {label}
    </span>
  );
}

/** Every CRM opportunity is named «Возможность …» — the prefix carries nothing. */
function stripOpportunityPrefix(s: string) {
  return s.replace(/^Возможность\s+/i, "");
}

function shorten(s: string, max = 30) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
