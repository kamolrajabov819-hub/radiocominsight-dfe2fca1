import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { DollarSign, Eye, MousePointerClick, Target, TrendingDown } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StatTile, StatRow } from "@/components/stat";
import { ExportButton } from "@/components/export-button";
import { ChartFrame } from "@/components/chart-frame";
import { Panel, PanelHeader, SectionRule } from "@/components/panel";
import {
  CHANNEL_COLOR,
  ChartTooltip,
  FunnelSteps,
  Grid,
  HBarRanking,
  OTHER_COLOR,
  PartToWhole,
  SERIES,
  ShareBar,
  lineCursor,
  sourcePalette,
  surfaceStroke,
  xAxisProps,
  yAxisProps,
} from "@/components/charts";
import { useData } from "@/lib/data-context";
import { useI18n } from "@/lib/i18n";
import { salesBySource } from "@/lib/parsers";
import {
  cpc,
  cpl,
  ctr,
  delta,
  filterByQuarter,
  fmtCompact,
  fmtDecimal,
  fmtInt,
  fmtMoney,
  fmtPct,
  fmtSom,
  sumGoogle,
  sumMeta,
} from "@/lib/metrics";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cross-channel — Radiocom Insight" },
      {
        name: "description",
        content:
          "Blended view of Radiocom marketing performance across Meta Ads, Google Ads, OLX and organic social.",
      },
      { property: "og:title", content: "Cross-channel — Radiocom Insight" },
      {
        property: "og:description",
        content: "Blended cross-channel marketing performance for Radiocom.",
      },
    ],
  }),
  component: Overview,
});

const CHANNELS = ["Meta Ads", "Google Ads", "OLX"] as const;

function Overview() {
  const { data, quarters, quarter, previousQuarter } = useData();
  const { t } = useI18n();

  /** Channel roll-up for an arbitrary quarter (null = all time). */
  const rollup = useMemo(() => {
    return (key: string | null) => {
      const m = sumMeta(filterByQuarter(data.meta, key));
      const g = sumGoogle(filterByQuarter(data.google, key));
      // OLX listing counters are lifetime totals — they are only meaningful
      // in the all-time view, so they stay out of a single-quarter blend.
      const includeOlx = key === null;
      const olxViews = includeOlx ? data.olx.reduce((a, p) => a + p.views, 0) : 0;
      const olxCalls = includeOlx ? data.olx.reduce((a, p) => a + p.phoneClicks, 0) : 0;

      const channels = [
        {
          name: "Meta Ads" as const,
          spend: m.spend,
          conversions: m.leads,
          impressions: m.impressions,
          clicks: m.clicks,
        },
        {
          name: "Google Ads" as const,
          spend: g.cost,
          conversions: g.conversions + g.phoneCalls,
          impressions: g.impressions,
          clicks: g.clicks,
        },
        {
          name: "OLX" as const,
          spend: 0,
          conversions: olxCalls,
          impressions: olxViews,
          clicks: olxCalls,
        },
      ].map((c) => ({
        ...c,
        color: CHANNEL_COLOR[c.name],
        cpl: c.spend > 0 && c.conversions > 0 ? c.spend / c.conversions : 0,
        ctr: ctr(c.clicks, c.impressions),
      }));

      const spend = channels.reduce((a, c) => a + c.spend, 0);
      const conversions = channels.reduce((a, c) => a + c.conversions, 0);
      const impressions = channels.reduce((a, c) => a + c.impressions, 0);
      const clicks = channels.reduce((a, c) => a + c.clicks, 0);

      return { m, g, channels, spend, conversions, impressions, clicks, includeOlx };
    };
  }, [data]);

  const now = rollup(quarter?.key ?? null);
  const prev = previousQuarter ? rollup(previousQuarter.key) : null;
  const blendedCpl = cpl(now.spend, now.conversions);
  const deltaSuffix = previousQuarter ? t("h.vs", { q: previousQuarter.short }) : undefined;

  /** Per-quarter series drive both the trend charts and the sparklines. */
  const byQuarter = useMemo(
    () =>
      quarters.map((q) => {
        const r = rollup(q.key);
        return {
          label: q.short,
          quarter: q.key,
          "Meta Ads": r.channels[0].spend,
          "Google Ads": r.channels[1].spend,
          metaLeads: r.channels[0].conversions,
          googleLeads: r.channels[1].conversions,
          spend: r.spend,
          leads: r.conversions,
          impressions: r.impressions,
          clicks: r.clicks,
          // A quarter with no conversions has no CPL — a zero here would
          // read as "free leads" instead of "no leads".
          cpl: r.conversions > 0 ? cpl(r.spend, r.conversions) : null,
          ctr: ctr(r.clicks, r.impressions),
        };
      }),
    [quarters, rollup],
  );

  const spendSlices = now.channels
    .filter((c) => c.spend > 0)
    .map((c) => ({ name: c.name, value: c.spend, color: c.color }));
  const leadSlices = now.channels
    .filter((c) => c.conversions > 0)
    .map((c) => ({ name: c.name, value: c.conversions, color: c.color }));

  const paid = now.channels.filter((c) => c.cpl > 0);
  const cheapest = [...paid].sort((a, b) => a.cpl - b.cpl)[0];
  const dearest = [...paid].sort((a, b) => b.cpl - a.cpl)[0];
  const engaged = now.channels.filter((c) => c.impressions > 0);
  const bestCtr = [...engaged].sort((a, b) => b.ctr - a.ctr)[0];
  const worstCtr = [...engaged].sort((a, b) => a.ctr - b.ctr)[0];

  const funnel = [
    { label: t("m.impressions"), value: now.impressions },
    { label: t("m.clicks"), value: now.clicks },
    { label: t("m.leads"), value: now.conversions },
  ];

  const exportSheets = [
    {
      name: "Cross-channel",
      rows: [
        ["Channel", "Spend (USD)", "Leads / conversions", "Impressions", "Clicks", "CPL", "CTR %"],
        ...now.channels.map(
          (c) =>
            [c.name, c.spend, c.conversions, c.impressions, c.clicks, c.cpl, c.ctr] as (
              string | number
            )[],
        ),
        [
          "Blended",
          now.spend,
          now.conversions,
          now.impressions,
          now.clicks,
          blendedCpl,
          ctr(now.clicks, now.impressions),
        ],
      ],
    },
    {
      name: "By quarter",
      rows: [
        ["Quarter", "Spend", "Leads", "Impressions", "Clicks", "CPL", "CTR %"],
        ...byQuarter.map(
          (q) =>
            [q.label, q.spend, q.leads, q.impressions, q.clicks, q.cpl, q.ctr] as (
              string | number
            )[],
        ),
      ],
    },
  ];

  return (
    <AppShell
      title={t("ov.title")}
      subtitle={t("ov.subtitle")}
      actions={<ExportButton filename="radiocom-cross-channel" sheets={exportSheets} />}
    >
      <SectionRule
        label={t("ov.blended")}
        note={quarter ? quarter.label : t("common.allQuartersCombined")}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          accent
          label={t("m.totalSpend")}
          value={fmtMoney(now.spend)}
          icon={DollarSign}
          delta={prev ? delta(now.spend, prev.spend) : null}
          deltaSuffix={deltaSuffix}
          trend={byQuarter.map((q) => q.spend)}
          trendColor={SERIES[0]}
        />
        <StatTile
          label={t("m.leadsConversions")}
          value={fmtInt(now.conversions)}
          sub={now.includeOlx ? t("ov.inclOlx") : t("ov.metaGoogleConv")}
          icon={Target}
          delta={prev ? delta(now.conversions, prev.conversions) : null}
          deltaSuffix={deltaSuffix}
          trend={byQuarter.map((q) => q.leads)}
          trendColor={SERIES[1]}
        />
        <StatTile
          label={t("m.blendedCpl")}
          value={blendedCpl > 0 ? fmtMoney(blendedCpl) : "—"}
          sub={t("h.spendOverImpressions")}
          icon={TrendingDown}
          lowerIsBetter
          delta={prev ? delta(blendedCpl, cpl(prev.spend, prev.conversions)) : null}
          deltaSuffix={deltaSuffix}
          trend={byQuarter.flatMap((q) => (q.cpl == null ? [] : [q.cpl]))}
          trendColor={SERIES[2]}
        />
        <StatTile
          label={t("m.impressions")}
          value={fmtCompact(now.impressions)}
          sub={fmtInt(now.impressions)}
          icon={Eye}
          delta={prev ? delta(now.impressions, prev.impressions) : null}
          deltaSuffix={deltaSuffix}
          trend={byQuarter.map((q) => q.impressions)}
          trendColor={SERIES[3]}
        />
        <StatTile
          label={t("m.clicks")}
          value={fmtInt(now.clicks)}
          sub={`${t("m.ctr")} ${fmtPct(ctr(now.clicks, now.impressions), 3)}`}
          icon={MousePointerClick}
          delta={prev ? delta(now.clicks, prev.clicks) : null}
          deltaSuffix={deltaSuffix}
          trend={byQuarter.map((q) => q.clicks)}
          trendColor={SERIES[4]}
        />
      </div>

      <SectionRule label={t("ov.whereMoneyGoes")} />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <ChartFrame
          className="xl:col-span-2"
          title={t("ov.spendByChannel")}
          hint={t("h.stackedUsd")}
          legend={[
            { label: "Meta Ads", color: CHANNEL_COLOR["Meta Ads"] },
            { label: "Google Ads", color: CHANNEL_COLOR["Google Ads"] },
          ]}
          table={{
            columns: [
              { key: "label", header: t("common.quarter") },
              { key: "meta", header: t("nav.metaAds"), numeric: true },
              { key: "google", header: t("nav.googleAds"), numeric: true },
              { key: "total", header: t("common.total"), numeric: true },
            ],
            rows: byQuarter.map((q) => ({
              label: q.label,
              meta: fmtMoney(q["Meta Ads"]),
              google: fmtMoney(q["Google Ads"]),
              total: fmtMoney(q["Meta Ads"] + q["Google Ads"]),
            })),
          }}
          empty={byQuarter.length ? undefined : t("ov.noPaidSpend")}
        >
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={byQuarter} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <Grid />
                <XAxis dataKey="label" {...xAxisProps} />
                <YAxis {...yAxisProps} tickFormatter={(v: number) => `$${fmtCompact(v)}`} />
                <ChartTooltip format={(v) => fmtMoney(v)} />
                <Bar
                  dataKey="Meta Ads"
                  stackId="spend"
                  fill={CHANNEL_COLOR["Meta Ads"]}
                  stroke={surfaceStroke}
                  strokeWidth={2}
                  maxBarSize={54}
                />
                <Bar
                  dataKey="Google Ads"
                  stackId="spend"
                  fill={CHANNEL_COLOR["Google Ads"]}
                  stroke={surfaceStroke}
                  strokeWidth={2}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={54}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartFrame>

        <ChartFrame
          title={t("ov.spendShare")}
          hint={quarter ? quarter.label : t("common.allTime")}
          legend={spendSlices.map((s) => ({ label: s.name, color: s.color }))}
          table={{
            columns: [
              { key: "channel", header: t("common.channel") },
              { key: "spend", header: t("m.spend"), numeric: true },
              { key: "share", header: t("common.share"), numeric: true },
            ],
            rows: spendSlices.map((s) => ({
              channel: s.name,
              spend: fmtMoney(s.value),
              share: fmtPct(now.spend > 0 ? (s.value / now.spend) * 100 : 0, 1),
            })),
          }}
          empty={spendSlices.length ? undefined : t("ov.noSpend")}
        >
          <PartToWhole
            data={spendSlices}
            format={(v) => fmtMoney(v)}
            centerValue={fmtMoney(now.spend)}
            centerLabel={t("m.totalSpend")}
          />
        </ChartFrame>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
        <ChartFrame
          title={t("ov.conversionShare")}
          hint={t("ov.conversionShareHint")}
          legend={leadSlices.map((s) => ({ label: s.name, color: s.color }))}
          table={{
            columns: [
              { key: "channel", header: t("common.channel") },
              { key: "conv", header: t("m.conversions"), numeric: true },
              { key: "share", header: t("common.share"), numeric: true },
            ],
            rows: leadSlices.map((s) => ({
              channel: s.name,
              conv: fmtInt(s.value),
              share: fmtPct(now.conversions > 0 ? (s.value / now.conversions) * 100 : 0, 1),
            })),
          }}
          empty={leadSlices.length ? undefined : t("ov.noConversions")}
        >
          <PartToWhole
            data={leadSlices}
            format={(v) => fmtInt(v)}
            centerValue={fmtInt(now.conversions)}
            centerLabel={t("m.conversions")}
          />
        </ChartFrame>

        <ChartFrame
          title={t("ov.blendedCplTitle")}
          hint={t("h.usdByQuarter")}
          table={{
            columns: [
              { key: "label", header: t("common.quarter") },
              { key: "cpl", header: t("m.blendedCpl"), numeric: true },
              { key: "spend", header: t("m.spend"), numeric: true },
              { key: "leads", header: t("m.conversions"), numeric: true },
            ],
            rows: byQuarter.map((q) => ({
              label: q.label,
              cpl: q.cpl != null ? fmtMoney(q.cpl) : "—",
              spend: fmtMoney(q.spend),
              leads: fmtInt(q.leads),
            })),
          }}
          empty={byQuarter.length ? undefined : t("ov.noQuarters")}
        >
          <div className="h-60">
            <ResponsiveContainer>
              <LineChart data={byQuarter} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <Grid />
                <XAxis dataKey="label" {...xAxisProps} />
                <YAxis {...yAxisProps} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
                <ChartTooltip format={(v) => fmtMoney(v)} cursor={lineCursor} />
                <Line
                  type="linear"
                  dataKey="cpl"
                  name={t("m.blendedCpl")}
                  stroke={SERIES[0]}
                  strokeWidth={2}
                  connectNulls={false}
                  dot={{ r: 4, strokeWidth: 2, stroke: surfaceStroke, fill: SERIES[0] }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartFrame>

        <ChartFrame
          title={t("ov.funnel")}
          hint={quarter ? quarter.label : t("common.allTime")}
          note={t("ov.funnelNote")}
          table={{
            columns: [
              { key: "stage", header: t("common.stage") },
              { key: "value", header: t("common.count"), numeric: true },
              { key: "rate", header: t("ov.fromPrevious"), numeric: true },
            ],
            rows: funnel.map((f, i) => ({
              stage: f.label,
              value: fmtInt(f.value),
              rate:
                i === 0 || funnel[i - 1].value === 0
                  ? "—"
                  : fmtPct((f.value / funnel[i - 1].value) * 100, 3),
            })),
          }}
          empty={now.impressions ? undefined : t("ov.noImpressions")}
        >
          <FunnelSteps data={funnel} format={(v) => fmtInt(v)} />
        </ChartFrame>
      </div>

      <SectionRule label={t("ov.leagueTable")} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ChartFrame
          title={t("ov.cplByChannel")}
          hint={t("ov.cplByChannelHint")}
          table={{
            columns: [
              { key: "channel", header: t("common.channel") },
              { key: "cpl", header: t("m.cpl"), numeric: true },
            ],
            rows: paid.map((c) => ({ channel: c.name, cpl: fmtMoney(c.cpl) })),
          }}
          empty={paid.length ? undefined : t("ov.noRankable")}
          note={paid.length === 1 ? t("ov.cplSingleNote") : undefined}
        >
          {paid.length === 1 ? (
            // A one-bar bar chart is just a number wearing a costume.
            <div className="flex h-full flex-col justify-center py-6">
              <div className="figure text-4xl leading-none">{fmtMoney(paid[0].cpl)}</div>
              <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <span className="h-2.5 w-2.5" style={{ background: paid[0].color }} aria-hidden />
                {paid[0].name} ·{" "}
                {t("ov.conversionsFrom", {
                  n: fmtInt(paid[0].conversions),
                  spend: fmtMoney(paid[0].spend),
                })}
              </div>
            </div>
          ) : (
            <HBarRanking
              data={[...paid]
                .sort((a, b) => b.cpl - a.cpl)
                .map((c) => ({ label: c.name, value: c.cpl }))}
              color={SERIES[0]}
              seriesName={t("m.cpl")}
              format={(v) => fmtMoney(v)}
              labelWidth={92}
            />
          )}
        </ChartFrame>

        <ChartFrame
          title={t("ov.ctrByChannel")}
          hint={t("h.clicksOverImpressions")}
          table={{
            columns: [
              { key: "channel", header: t("common.channel") },
              { key: "ctr", header: t("m.ctr"), numeric: true },
              { key: "clicks", header: t("m.clicks"), numeric: true },
            ],
            rows: engaged.map((c) => ({
              channel: c.name,
              ctr: fmtPct(c.ctr, 3),
              clicks: fmtInt(c.clicks),
            })),
          }}
          empty={engaged.length ? undefined : t("ov.noImpressions")}
        >
          <HBarRanking
            data={[...engaged]
              .sort((a, b) => b.ctr - a.ctr)
              .map((c) => ({ label: c.name, value: c.ctr }))}
            color={SERIES[1]}
            seriesName={t("m.ctr")}
            format={(v) => `${v.toFixed(2)}%`}
            labelWidth={92}
          />
        </ChartFrame>

        <Panel>
          <PanelHeader title={t("ov.readouts")} hint={t("ov.readoutsHint")} />
          <ul className="mt-3">
            {cheapest && (
              <StatRow
                label={t("ov.cheapestCpl")}
                value={`${cheapest.name} · ${fmtMoney(cheapest.cpl)}`}
                swatch={cheapest.color}
              />
            )}
            {dearest && dearest !== cheapest && (
              <StatRow
                label={t("ov.dearestCpl")}
                value={`${dearest.name} · ${fmtMoney(dearest.cpl)}`}
                swatch={dearest.color}
              />
            )}
            {bestCtr && (
              <StatRow
                label={t("ov.highestCtr")}
                value={`${bestCtr.name} · ${fmtPct(bestCtr.ctr, 3)}`}
                swatch={bestCtr.color}
              />
            )}
            {worstCtr && worstCtr !== bestCtr && (
              <StatRow
                label={t("ov.lowestCtr")}
                value={`${worstCtr.name} · ${fmtPct(worstCtr.ctr, 3)}`}
                swatch={worstCtr.color}
              />
            )}
            <StatRow label={t("ov.blendedCpc")} value={fmtDecimal(cpc(now.spend, now.clicks), 4)} />
            <StatRow
              label={t("ov.channelsReporting")}
              value={t("common.nOfTotal", {
                n: now.channels.filter((c) => c.impressions > 0 || c.spend > 0).length,
                total: CHANNELS.length,
              })}
            />
          </ul>
        </Panel>
      </div>

      <SalesSourceSection />
    </AppShell>
  );
}

/** Below this a win rate is one deal flipping between 0% and 100%. */
const MIN_DEALS_FOR_RATE = 5;

/**
 * The revenue end of the dashboard. The Sales tab has no date column — it is
 * the whole 2026 pipeline — so this block deliberately ignores the quarter
 * filter and says so.
 */
function SalesSourceSection() {
  const { data } = useData();
  const { t, tSource } = useI18n();

  const won = useMemo(() => data.sales.filter((s) => s.outcome === "won"), [data.sales]);
  const wonBySource = useMemo(() => salesBySource(won), [won]);
  const allBySource = useMemo(() => salesBySource(data.sales), [data.sales]);
  const palette = useMemo(() => sourcePalette(wonBySource.map((s) => s.source)), [wonBySource]);

  const slices = useMemo(() => {
    const head = wonBySource.slice(0, 5);
    const tail = wonBySource.slice(5);
    const out = head.map((s) => ({
      name: tSource(s.source),
      value: s.deals,
      color: palette[s.source] ?? SERIES[0],
    }));
    if (tail.length) {
      out.push({
        name: t("sales.other", { n: tail.length }),
        value: tail.reduce((a, s) => a + s.deals, 0),
        color: OTHER_COLOR,
      });
    }
    return out.filter((s) => s.value > 0);
  }, [wonBySource, palette, t, tSource]);

  const winRates = useMemo(() => {
    const wonCount = new Map(wonBySource.map((s) => [s.source, s.deals]));
    return allBySource
      .filter((s) => s.deals >= MIN_DEALS_FOR_RATE)
      .map((s) => ({
        source: s.source,
        label: tSource(s.source),
        rate: ((wonCount.get(s.source) ?? 0) / s.deals) * 100,
        deals: s.deals,
      }))
      .sort((a, b) => b.rate - a.rate);
  }, [allBySource, wonBySource, tSource]);

  if (!data.sales.length) return null;

  const top = wonBySource[0];
  const wonRevenue = won.reduce((a, s) => a + s.revenue, 0);

  return (
    <>
      <SectionRule
        label={t("ov.salesBySource")}
        note={
          top
            ? t("sales.headline", {
                pct: fmtPct(top.dealSharePct, 1),
                source: tSource(top.source),
              })
            : undefined
        }
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ChartFrame
          className="lg:col-span-2"
          title={t("ov.salesBySource")}
          hint={t("ov.salesBySourceHint")}
          actions={
            <Link
              to="/sales"
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              {t("ov.openSales")}
            </Link>
          }
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
          empty={slices.length ? undefined : t("sales.noWon")}
        >
          <ShareBar data={slices} format={(v) => fmtInt(v)} />
        </ChartFrame>

        <Panel>
          <PanelHeader title={t("ov.topSources")} hint={t("ov.topSourcesHint")} />
          <ul className="mt-3">
            {winRates.slice(0, 4).map((s) => (
              <StatRow
                key={s.source}
                label={s.label}
                value={fmtPct(s.rate, 1)}
                swatch={palette[s.source] ?? SERIES[0]}
              />
            ))}
            <StatRow label={t("sales.wonDeals")} value={fmtInt(won.length)} />
            <StatRow label={t("sales.wonRevenue")} value={fmtSom(wonRevenue)} />
          </ul>
        </Panel>
      </div>
    </>
  );
}
