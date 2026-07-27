import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

/* ------------------------------------------------------------------ *
 * Palette
 *
 * Fixed slot order — a series keeps its hue when a filter removes its
 * neighbours. Never index these by rank.
 * ------------------------------------------------------------------ */

export const SERIES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
] as const;

/** Sequential blue ramp for ordered marks (funnel stages, watch-through). */
export const SEQ = [
  "var(--seq-2)",
  "var(--seq-3)",
  "var(--seq-4)",
  "var(--seq-5)",
  "var(--seq-6)",
] as const;

/** Colour follows the channel, never its position in a sorted list. */
export const CHANNEL_COLOR: Record<string, string> = {
  "Meta Ads": SERIES[0],
  "Google Ads": SERIES[1],
  OLX: SERIES[2],
  Instagram: SERIES[3],
  Facebook: SERIES[4],
  "Google Analytics": SERIES[5],
  Search: SERIES[1],
  "Display & other": SERIES[3],
};

/**
 * CRM deal sources that also exist as channels elsewhere in the dashboard
 * keep that channel's hue, so "OLX" is the same colour on the sales page as
 * it is on the cross-channel overview.
 */
const SOURCE_COLOR: Record<string, string> = {
  OLX: CHANNEL_COLOR.OLX,
  Instagram: CHANNEL_COLOR.Instagram,
  "Radiocom.uz": CHANNEL_COLOR["Google Analytics"],
  Radiocomnet: CHANNEL_COLOR["Google Analytics"],
};

/**
 * Colours a ranked list of sources: the channel-bound ones first, then the
 * remaining palette slots in rank order. Keyed by the raw CRM name so the
 * colour survives a language switch.
 */
export function sourcePalette(sources: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const taken = new Set<string>();
  sources.forEach((s) => {
    const fixed = SOURCE_COLOR[s];
    if (fixed) {
      out[s] = fixed;
      taken.add(fixed);
    }
  });
  let next = 0;
  sources.forEach((s) => {
    if (out[s]) return;
    while (next < SERIES.length && taken.has(SERIES[next])) next++;
    const color = SERIES[next % SERIES.length];
    out[s] = color;
    taken.add(color);
    next++;
  });
  return out;
}

/**
 * Neutral hue for a rolled-up "Other (n)" bucket. Deliberately outside the
 * series palette so the tail never wears the same colour as a real category.
 */
export const OTHER_COLOR = "var(--color-muted-foreground)";

export const surfaceStroke = "var(--color-surface)";

/* ------------------------------------------------------------------ *
 * Shared axis / grid chrome — solid hairlines, recessive
 * ------------------------------------------------------------------ */

const tick = {
  fill: "var(--color-muted-foreground)",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
} as const;

export const gridProps = {
  stroke: "var(--rule)",
  strokeWidth: 1,
  vertical: false,
} as const;

export const xAxisProps = {
  tick,
  tickLine: false,
  axisLine: { stroke: "var(--rule)" },
  height: 28,
} as const;

export const yAxisProps = {
  tick,
  tickLine: false,
  axisLine: false,
  width: 52,
} as const;

export const barCursor = { fill: "var(--color-surface-sunken)" } as const;
export const lineCursor = { stroke: "var(--rule)", strokeWidth: 1 } as const;

export const Grid = () => <CartesianGrid {...gridProps} />;

/* ------------------------------------------------------------------ *
 * Tooltip
 * ------------------------------------------------------------------ */

type TooltipEntry = {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
};

export type TooltipFormat = (value: number, key: string) => string;

export function TooltipCard(props: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  format?: TooltipFormat;
  /** Extra line rendered under the series list. */
  footer?: (payload: TooltipEntry[]) => ReactNode;
}) {
  const { active, payload, label, format, footer } = props;
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-44 border border-border bg-popover px-3 py-2 shadow-lg">
      {label !== undefined && label !== "" && (
        <div className="eyebrow mb-1.5 text-foreground">{label}</div>
      )}
      <ul className="space-y-1">
        {payload.map((p, i) => (
          <li key={i} className="flex items-center justify-between gap-5 text-xs">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0" style={{ background: p.color }} aria-hidden />
              <span className="truncate text-muted-foreground">{p.name}</span>
            </span>
            <span className="tnum shrink-0">
              {format && typeof p.value === "number"
                ? format(p.value, String(p.dataKey ?? ""))
                : String(p.value ?? "—")}
            </span>
          </li>
        ))}
      </ul>
      {footer?.(payload)}
    </div>
  );
}

/** `<ChartTooltip format={...} />` — thin wrapper so pages stay readable. */
export function ChartTooltip({
  format,
  cursor = barCursor,
  footer,
}: {
  format?: TooltipFormat;
  cursor?: object | false;
  footer?: (payload: TooltipEntry[]) => ReactNode;
}) {
  return (
    <Tooltip
      cursor={cursor}
      wrapperStyle={{ outline: "none" }}
      content={<TooltipCard format={format} footer={footer} />}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Sparkline — tiny trend inside a stat tile
 * ------------------------------------------------------------------ */

export function Sparkline({
  points,
  className,
  color = "var(--chart-1)",
}: {
  points: number[];
  className?: string;
  color?: string;
}) {
  if (points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const stepX = 100 / (points.length - 1);
  const coords = points.map((p, i) => [i * stepX, 26 - ((p - min) / span) * 22] as const);
  const line = coords
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const area = `${line} L100 28 L0 28 Z`;
  const last = coords[coords.length - 1];

  return (
    <svg
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      className={cn("h-7 w-full", className)}
      aria-hidden
    >
      <path d={area} fill={color} opacity={0.1} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={2.4} fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Donut — part-to-whole only, at most six slices
 * ------------------------------------------------------------------ */

export type Slice = { name: string; value: number; color: string };

export function Donut({
  data,
  format,
  centerLabel,
  centerValue,
  height = 240,
}: {
  data: Slice[];
  format?: TooltipFormat;
  centerLabel?: string;
  centerValue?: string;
  height?: number;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="88%"
            paddingAngle={1.5}
            stroke={surfaceStroke}
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            wrapperStyle={{ outline: "none" }}
            content={
              <TooltipCard
                format={(v, k) =>
                  `${format ? format(v, k) : v.toLocaleString("en-US")}${
                    total > 0 ? ` · ${((v / total) * 100).toFixed(1)}%` : ""
                  }`
                }
              />
            }
          />
        </PieChart>
      </ResponsiveContainer>
      {(centerValue || centerLabel) && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          {/* Held to ~40% of the ring so a long label can never spill over it. */}
          <div className="max-w-[40%]">
            {centerValue && <div className="figure text-xl leading-none">{centerValue}</div>}
            {centerLabel && (
              <div className="eyebrow mt-1.5 line-clamp-2 leading-snug">{centerLabel}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Part-to-whole with only two parts. A two-slice pie is unreadable, so the
 * split is shown as one 100%-wide stacked bar with direct labels instead.
 */
export function ShareBar({
  data,
  format = (v) => v.toLocaleString("en-US"),
}: {
  data: Slice[];
  format?: (v: number) => string;
}) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  return (
    <div className="py-2">
      <div className="flex h-9 w-full gap-0.5 overflow-hidden">
        {data.map((d) => (
          <div
            key={d.name}
            className="h-full min-w-1"
            style={{ background: d.color, width: `${(d.value / total) * 100}%` }}
            title={`${d.name}: ${format(d.value)}`}
          />
        ))}
      </div>
      <ul className="mt-3">
        {data.map((d) => (
          <li
            key={d.name}
            className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 text-xs last:border-0"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0" style={{ background: d.color }} aria-hidden />
              <span className="truncate text-muted-foreground">{d.name}</span>
            </span>
            <span className="shrink-0">
              <span className="tnum">{format(d.value)}</span>
              <span className="tnum ml-2 text-muted-foreground">
                {((d.value / total) * 100).toFixed(1)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Picks the readable form automatically: bar for two parts, donut beyond. */
export function PartToWhole({
  data,
  format,
  centerLabel,
  centerValue,
  height,
}: {
  data: Slice[];
  format?: TooltipFormat;
  centerLabel?: string;
  centerValue?: string;
  height?: number;
}) {
  if (data.length < 3) {
    return <ShareBar data={data} format={format ? (v) => format(v, "") : undefined} />;
  }
  return (
    <Donut
      data={data}
      format={format}
      centerLabel={centerLabel}
      centerValue={centerValue}
      height={height}
    />
  );
}

/**
 * Funnel stages spanning several orders of magnitude. Column bars would
 * render the tail stages as invisible slivers, so each stage gets its own
 * full-width track with the value and step conversion beside it.
 */
export function FunnelSteps({
  data,
  format = (v) => v.toLocaleString("en-US"),
  /**
   * "previous" for genuinely sequential stages (impressions → clicks →
   * leads). "first" when the later stages are parallel actions off the same
   * base — comparing them to each other would invent a sequence.
   */
  relativeTo = "previous",
}: {
  data: { label: string; value: number }[];
  format?: (v: number) => string;
  relativeTo?: "previous" | "first";
}) {
  const { t } = useI18n();
  const top = data[0]?.value || 1;
  const baseLabel = data[0]?.label ?? "";
  return (
    <ul className="space-y-3 py-1">
      {data.map((stage, i) => {
        const base = relativeTo === "first" ? data[0].value : i > 0 ? data[i - 1].value : null;
        const width = Math.max((stage.value / top) * 100, stage.value > 0 ? 0.6 : 0);
        return (
          <li key={stage.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium">{stage.label}</span>
              <span className="flex items-baseline gap-2">
                <span className="tnum text-sm">{format(stage.value)}</span>
                {i > 0 && base !== null && (
                  <span className="tnum text-[0.6875rem] text-muted-foreground">
                    {base > 0
                      ? relativeTo === "first"
                        ? t("common.ofBase", {
                            v: `${((stage.value / base) * 100).toFixed(2)}%`,
                            base: baseLabel,
                          })
                        : t("common.ofPrevious", {
                            v: `${((stage.value / base) * 100).toFixed(2)}%`,
                          })
                      : "—"}
                  </span>
                )}
              </span>
            </div>
            <div className="mt-1.5 h-2.5 w-full bg-surface-sunken">
              <div
                className="h-full"
                style={{
                  width: `${width}%`,
                  background: SEQ[Math.min(i, SEQ.length - 1)],
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One compact bar chart per metric, each with its own scale. This is the
 * answer to "several measures, wildly different magnitudes" — a shared axis
 * would flatten every series but the largest.
 */
export function SmallMultiples({
  series,
  periods,
  format = (v) => v.toLocaleString("en-US"),
}: {
  series: { name: string; color: string; values: number[] }[];
  periods: string[];
  format?: (v: number) => string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {series.map((s) => (
        <figure key={s.name} className="min-w-0">
          <figcaption className="mb-1 flex items-center gap-1.5 text-xs font-medium">
            <span className="h-2.5 w-2.5 shrink-0" style={{ background: s.color }} aria-hidden />
            <span className="truncate">{s.name}</span>
            <span className="tnum ml-auto shrink-0 text-muted-foreground">
              {format(s.values.reduce((a, v) => a + v, 0))}
            </span>
          </figcaption>
          <div className="h-32">
            <ResponsiveContainer>
              <BarChart
                data={periods.map((p, i) => ({ label: p, value: s.values[i] ?? 0 }))}
                margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
              >
                <CartesianGrid {...gridProps} />
                <XAxis
                  dataKey="label"
                  {...xAxisProps}
                  height={22}
                  tick={{ ...tick, fontSize: 10 }}
                />
                <YAxis
                  {...yAxisProps}
                  width={44}
                  tickFormatter={(v: number) => format(v)}
                  tick={{ ...tick, fontSize: 10 }}
                />
                <ChartTooltip format={(v) => format(v)} />
                <Bar
                  dataKey="value"
                  name={s.name}
                  fill={s.color}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </figure>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Horizontal ranking bars — one series, one colour, labels outside
 * ------------------------------------------------------------------ */

export function HBarRanking({
  data,
  color = SERIES[0],
  format = (v) => v.toLocaleString("en-US"),
  height,
  labelWidth = 150,
  seriesName = "Value",
}: {
  data: { label: string; value: number }[];
  color?: string;
  format?: (v: number) => string;
  height?: number;
  labelWidth?: number;
  seriesName?: string;
}) {
  const h = height ?? Math.max(140, data.length * 26 + 24);
  return (
    <div style={{ height: h }}>
      <ResponsiveContainer>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 64, bottom: 4, left: 0 }}
          barCategoryGap={4}
        >
          <CartesianGrid {...gridProps} horizontal={false} vertical />
          <XAxis type="number" {...xAxisProps} hide />
          <YAxis
            type="category"
            dataKey="label"
            {...yAxisProps}
            width={labelWidth}
            tick={{ ...tick, fontFamily: "var(--font-sans)" }}
            interval={0}
          />
          <ChartTooltip format={(v) => format(v)} />
          <Bar dataKey="value" name={seriesName} fill={color} radius={[0, 3, 3, 0]} maxBarSize={16}>
            <LabelList
              dataKey="value"
              position="right"
              offset={8}
              formatter={(v: unknown) => format(Number(v))}
              style={{
                fill: "var(--color-muted-foreground)",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Ordinal stage bars — funnel / watch-through, sequential ramp
 * ------------------------------------------------------------------ */

export function StageBars({
  data,
  format = (v) => v.toLocaleString("en-US"),
  height = 220,
}: {
  data: { label: string; value: number; note?: string }[];
  format?: (v: number) => string;
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 22, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="label"
            {...xAxisProps}
            tick={{ ...tick, fontFamily: "var(--font-sans)" }}
          />
          <YAxis {...yAxisProps} tickFormatter={(v: number) => format(v)} />
          <ChartTooltip format={(v) => format(v)} />
          <Bar dataKey="value" name="Stage" radius={[3, 3, 0, 0]} maxBarSize={72}>
            {data.map((d, i) => (
              <Cell key={d.label} fill={SEQ[Math.min(i, SEQ.length - 1)]} />
            ))}
            <LabelList
              dataKey="value"
              position="top"
              offset={6}
              formatter={(v: unknown) => format(Number(v))}
              style={{
                fill: "var(--color-muted-foreground)",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
