import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  Facebook,
  Globe2,
  Handshake,
  Instagram,
  LayoutDashboard,
  Menu,
  ShoppingBag,
  Target,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlobalFilter } from "./global-filter";
import { RadiocomLogo, RadiocomMark } from "./brand";
import { ThemeToggle } from "./theme";
import { useData } from "@/lib/data-context";
import { LanguageToggle, useI18n, type Key } from "@/lib/i18n";

const NAV: { group: Key; items: { to: string; label: Key; icon: typeof Target }[] }[] = [
  {
    group: "nav.overview",
    items: [
      { to: "/", label: "nav.crossChannel", icon: LayoutDashboard },
      { to: "/sales", label: "nav.sales", icon: Handshake },
    ],
  },
  {
    group: "nav.paid",
    items: [
      { to: "/meta-ads", label: "nav.metaAds", icon: Target },
      { to: "/google-ads", label: "nav.googleAds", icon: BarChart3 },
    ],
  },
  {
    group: "nav.organic",
    items: [
      { to: "/facebook", label: "nav.facebook", icon: Facebook },
      { to: "/instagram", label: "nav.instagram", icon: Instagram },
    ],
  },
  {
    group: "nav.searchMarketplace",
    items: [
      { to: "/google-analytics", label: "nav.analyticsSeo", icon: Globe2 },
      { to: "/olx", label: "nav.olx", icon: ShoppingBag },
    ],
  },
];

/**
 * Rendered only after mount. The fetch timestamp is non-deterministic — the
 * SSR pass and the browser can land on different values — and the browser
 * formats it in a different zone, so anything derived from it during the
 * first render fails hydration.
 */
function SyncedAt({ iso }: { iso: string }) {
  const { t } = useI18n();
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    setLocal(new Date(iso).toLocaleString(undefined, { hour12: false }));
  }, [iso]);
  if (!local) return <span className="tnum">{t("shell.syncedJustNow")}</span>;
  return <span className="tnum">{local}</span>;
}

export function AppShell({
  children,
  title,
  subtitle,
  actions,
  /** Off for tabs whose data is not reported by quarter (SEO, OLX). */
  showFilter = true,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  showFilter?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { sourceError, quarter, fetchedAt } = useData();
  const { t } = useI18n();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* ---- Rail ------------------------------------------------- */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-border bg-sidebar transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
          navOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <RadiocomLogo />
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            className="text-muted-foreground md:hidden"
            aria-label={t("nav.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          {NAV.map((section) => (
            <div key={section.group} className="mb-4 last:mb-0">
              <div className="eyebrow px-2 pb-1.5">{t(section.group)}</div>
              <ul>
                {section.items.map((item) => {
                  const active = pathname === item.to;
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        onClick={() => setNavOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 border-l-2 px-2.5 py-1.5 text-sm transition-colors",
                          active
                            ? "border-l-primary bg-sidebar-accent font-semibold text-foreground"
                            : "border-l-transparent text-muted-foreground hover:border-l-rule hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden />
                        {t(item.label)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-border px-4 py-3">
          <div className="eyebrow">{t("shell.source")}</div>
          <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted-foreground">
            {t("shell.workbook")} · <span className="tnum">Insights Overall</span>
            <br />
            {sourceError ? (
              <span className="text-negative">{t("shell.syncFailed")}</span>
            ) : (
              <>
                {t("shell.synced")} <SyncedAt iso={fetchedAt} />
              </>
            )}
          </p>
        </div>
      </aside>

      {navOpen && (
        <button
          type="button"
          aria-label={t("nav.close")}
          className="fixed inset-0 z-30 bg-foreground/20 md:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}

      {/* ---- Content ---------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setNavOpen(true)}
                className="text-muted-foreground md:hidden"
                aria-label={t("nav.open")}
              >
                <Menu className="h-5 w-5" />
              </button>
              <RadiocomMark className="h-6 w-6 md:hidden" />
              <div className="min-w-0">
                <h1 className="truncate font-display text-lg font-extrabold leading-tight tracking-tight">
                  {title}
                </h1>
                <p className="truncate text-xs text-muted-foreground">
                  {subtitle ? `${subtitle} · ` : ""}
                  {showFilter
                    ? quarter
                      ? quarter.label
                      : t("shell.allTimeBlended")
                    : t("shell.notQuarterly")}
                </p>
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              {showFilter && <GlobalFilter />}
              {actions}
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </div>
        </header>

        {sourceError && (
          <div className="flex items-start gap-2.5 border-b border-border bg-accent px-4 py-2.5 text-xs text-accent-foreground sm:px-6">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden />
            <p>
              <strong className="font-semibold">{t("shell.dataUnavailable")}</strong> {sourceError}
            </p>
          </div>
        )}

        <main className="flex-1 px-4 py-5 sm:px-6">{children}</main>

        <footer className="border-t border-border px-4 py-4 text-[0.6875rem] text-muted-foreground sm:px-6">
          {t("shell.footer")}
        </footer>
      </div>
    </div>
  );
}
