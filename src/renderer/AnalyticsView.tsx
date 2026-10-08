import {
  Activity,
  AlertTriangle,
  Boxes,
  Check,
  CircleCheck,
  CircleMinus,
  CircleX,
  Code2,
  Copy,
  GitBranch,
  Info,
  ListFilter,
  RefreshCw,
  Workflow
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, TooltipButton } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { DEFAULT_ANALYTICS_EXCLUDED_PATHS } from "../shared/analyticsPathFilter";
import type {
  AnalyticsPerson,
  AnalyticsRange,
  AnalyticsRangeKey,
  GitHubFailure,
  GitHubWorkflowAnalytics,
  GitHubWorkflowAnalyticsRange,
  RepositoryAnalytics,
  RepositoryAnalyticsProgress
} from "../shared/types";
import {
  BarList,
  ChartCard,
  ChartLegend,
  ColumnChart,
  CRITICAL_COLOR,
  DivergingColumnChart,
  GOOD_COLOR,
  LineChart,
  NEUTRAL_COLOR,
  ORDINAL_COLORS,
  OTHER_COLOR,
  POSITIVE_COLOR,
  NEGATIVE_COLOR,
  PunchCard,
  SERIES_COLORS,
  StatTile,
  type BarRow,
  type LegendItem
} from "./analyticsCharts";
import {
  binAxisTicks,
  formatBinAxisLabel,
  formatBinTitle,
  formatBytes,
  formatCompact,
  formatCount,
  formatDate,
  formatDuration,
  formatPercent,
  formatPointChange,
  formatShare,
  formatSignedChange,
  splitPath
} from "./analyticsFormat";
import { LoadingState } from "./LoadingState";
import { useGitHubWorkflowAnalytics, useRepositoryAnalytics } from "./useRepositoryAnalytics";
import { usePersistentWorkspacePanelState } from "./workspacePanelState";

export type AnalyticsSection = "activity" | "code" | "assets" | "branches" | "ci";

const RANGE_OPTIONS: Array<{ value: AnalyticsRangeKey; label: string; period: string }> = [
  { value: "d90", label: "90 days", period: "previous 90 days" },
  { value: "y1", label: "12 months", period: "previous 12 months" },
  { value: "all", label: "All time", period: "" }
];
const CI_RANGE_OPTIONS: Array<{ value: GitHubWorkflowAnalyticsRange; label: string }> = [
  { value: "d30", label: "30 days" },
  { value: "d90", label: "90 days" }
];
const COMMIT_SIZE_LABELS = ["Assets", "1–10", "11–50", "51–200", "201–1k", "1k+"];

export interface AnalyticsViewProps {
  active: boolean;
  repoPath: string;
  enabled: boolean;
  githubAvailable: boolean;
  canOpenFileHistory: boolean;
  onOpenFileHistory: (path: string, headHash: string) => void;
  onOpenBranchManager: () => void;
  onOpenWorkflowRuns: (branch: string) => void;
  renderGitHubFailure: (failure: GitHubFailure, retry: () => void) => ReactNode;
}

export function AnalyticsView({
  active,
  repoPath,
  enabled,
  githubAvailable,
  canOpenFileHistory,
  onOpenFileHistory,
  onOpenBranchManager,
  onOpenWorkflowRuns,
  renderGitHubFailure
}: AnalyticsViewProps): ReactNode {
  const [storedSection, setSection] = usePersistentWorkspacePanelState<AnalyticsSection>("analytics-section", "activity");
  const [range, setRange] = usePersistentWorkspacePanelState<AnalyticsRangeKey>("analytics-range", "y1");
  const [excludePaths, setExcludePaths] = usePersistentWorkspacePanelState("analytics-exclude-paths", true);
  const [ciRange, setCiRange] = usePersistentWorkspacePanelState<GitHubWorkflowAnalyticsRange>("analytics-ci-range", "d30");
  const [excludedPathsOpen, setExcludedPathsOpen] = useState(false);
  const section: AnalyticsSection = storedSection === "ci" && !githubAvailable ? "activity" : storedSection;
  const analytics = useRepositoryAnalytics(repoPath, enabled, active, excludePaths);
  const ci = useGitHubWorkflowAnalytics(repoPath, enabled && githubAvailable, active && section === "ci", ciRange);
  const data = analytics.data;
  const historySection = section === "activity" || section === "code";
  const sections: Array<{ value: AnalyticsSection; label: string; icon: ReactNode }> = [
    { value: "activity", label: "Activity", icon: <Activity /> },
    { value: "code", label: "Code", icon: <Code2 /> },
    { value: "assets", label: "Assets", icon: <Boxes /> },
    { value: "branches", label: "Branches", icon: <GitBranch /> },
    ...(githubAvailable ? [{ value: "ci" as const, label: "CI", icon: <Workflow /> }] : [])
  ];
  const refreshing = section === "ci" ? ci.loading : analytics.loading;

  return (
    <div className="analytics-view">
      <div className="analytics-toolbar">
        <Tabs value={section} onValueChange={(value) => setSection(value as AnalyticsSection)}>
          <TabsList aria-label="Analytics sections">
            {sections.map((item) => <TabsTrigger key={item.value} value={item.value}>{item.icon}{item.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <div className="analytics-filters">
          {historySection ? (
            <>
              <Segmented label="Date range" options={RANGE_OPTIONS} value={range} onChange={setRange} />
              <span className="analytics-exclude">
                <label className="analytics-check">
                  <input type="checkbox" checked={excludePaths} onChange={(event) => setExcludePaths(event.target.checked)} />
                  Exclude vendored paths
                </label>
                <TooltipButton type="button" variant="ghost" size="icon-xs" aria-label="Edit excluded paths" tooltip="Edit excluded paths" onClick={() => setExcludedPathsOpen(true)}><ListFilter /></TooltipButton>
              </span>
            </>
          ) : null}
          {section === "ci" ? <Segmented label="CI date range" options={CI_RANGE_OPTIONS} value={ciRange} onChange={setCiRange} /> : null}
        </div>
        <div className="analytics-toolbar-end">
          <TooltipButton
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={refreshing ? "Refreshing analytics" : "Refresh analytics"}
            tooltip="Refresh analytics"
            disabled={refreshing}
            onClick={() => { void (section === "ci" ? ci.refresh() : analytics.refresh()); }}
          >
            <RefreshCw className={refreshing ? "animate-spin motion-reduce:animate-none" : undefined} />
          </TooltipButton>
        </div>
      </div>
      <div className="analytics-scroll" data-workspace-scroll-key="analytics">
        <div className={cn("analytics-content", (section === "ci" ? ci.loading && ci.data : analytics.loading && data) && "is-refreshing")}>
          <p className="analytics-status" aria-live="polite">{section === "ci" ? ciStatus(ci.data, ci.loading) : analyticsStatus(data, analytics.loading, analytics.progress)}</p>
          {section === "ci" ? (
            ci.data ? <CiSection data={ci.data} failure={ci.failure} renderFailure={(failure) => renderGitHubFailure(failure, () => { void ci.refresh(); })} onOpenWorkflowRuns={onOpenWorkflowRuns} />
              : ci.failure ? renderGitHubFailure(ci.failure, () => { void ci.refresh(); })
                : <LoadingState label="Loading workflow runs" className="min-h-48" />
          ) : data ? (
            <>
              {analytics.error ? <Notice tone="warning">{analytics.error}</Notice> : null}
              {data.history.truncated ? <Notice>Analysis covers the newest {formatCount(data.history.commits)} commits. Older history was skipped to keep memory use bounded.</Notice> : null}
              {section === "activity" ? <ActivitySection data={data} range={range} /> : null}
              {section === "code" ? <CodeSection data={data} range={range} canOpenFileHistory={canOpenFileHistory} onOpenFileHistory={onOpenFileHistory} /> : null}
              {section === "assets" ? <AssetsSection data={data} canOpenFileHistory={canOpenFileHistory} onOpenFileHistory={onOpenFileHistory} /> : null}
              {section === "branches" ? <BranchesSection data={data} onOpenBranchManager={onOpenBranchManager} /> : null}
            </>
          ) : analytics.error ? (
            <div className="analytics-empty" role="alert">
              <AlertTriangle aria-hidden="true" />
              <h3>Unable to analyze this repository</h3>
              <p className="selectable-text">{analytics.error}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => { void analytics.refresh(); }}>Try again</Button>
            </div>
          ) : (
            <AnalyticsProgress progress={analytics.progress} />
          )}
        </div>
      </div>
      <ExcludedPathsDialog
        open={excludedPathsOpen}
        repoPath={repoPath}
        onOpenChange={setExcludedPathsOpen}
        onSaved={() => {
          setExcludePaths(true);
          void analytics.refresh();
        }}
      />
    </div>
  );
}

function analyticsStatus(data: RepositoryAnalytics | null, loading: boolean, progress: RepositoryAnalyticsProgress | null): string {
  if (loading && progress?.phase === "history" && progress.totalCommits) return `Reading history: ${formatCount(progress.processedCommits)} of ${formatCount(progress.totalCommits)} commits`;
  if (loading && progress?.phase === "assets") return "Measuring files";
  if (loading) return data ? "Refreshing" : "Analyzing";
  if (!data) return "";
  return `${formatCount(data.history.commits)} commits analyzed${data.branch ? ` on ${data.branch}` : ""}${data.excludePaths && data.excludedPathPatterns.length ? ` · ${formatCount(data.excludedPathPatterns.length)} excluded ${data.excludedPathPatterns.length === 1 ? "pattern" : "patterns"}` : ""}`;
}

function ciStatus(data: GitHubWorkflowAnalytics | null, loading: boolean): string {
  if (loading) return data ? "Refreshing" : "Loading runs";
  if (!data) return "";
  return `${formatCount(data.passed + data.failed + data.cancelled)} completed runs`;
}

function AnalyticsProgress({ progress }: { progress: RepositoryAnalyticsProgress | null }): ReactNode {
  const fraction = progress?.phase === "history" && progress.totalCommits ? progress.processedCommits / progress.totalCommits : null;
  return (
    <div className="analytics-empty" role="status" aria-live="polite">
      <Activity aria-hidden="true" />
      <h3>Analyzing repository history</h3>
      <p>
        {progress?.phase === "assets" ? "Measuring files and LFS objects."
          : progress?.phase === "branches" ? "Comparing branches."
            : progress?.totalCommits ? `Read ${formatCount(progress.processedCommits)} of ${formatCount(progress.totalCommits)} commits.`
              : "Listing commits."}
      </p>
      <div className="analytics-progress" aria-hidden="true"><span style={{ width: `${Math.round((fraction ?? (progress ? 1 : 0.05)) * 100)}%` }} /></div>
      <p className="analytics-empty-hint">The first analysis reads full history. Later updates only read new commits.</p>
    </div>
  );
}

function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}): ReactNode {
  return (
    <div className="analytics-segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>{option.label}</button>
      ))}
    </div>
  );
}

function Notice({ tone = "info", children }: { tone?: "info" | "warning"; children: ReactNode }): ReactNode {
  return (
    <div className={cn("analytics-notice", tone === "warning" && "is-warning")} role={tone === "warning" ? "alert" : "note"}>
      {tone === "warning" ? <AlertTriangle aria-hidden="true" /> : <Info aria-hidden="true" />}
      <div>{children}</div>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }): ReactNode {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={() => {
        void window.githead.copyTextToClipboard({ text }).then((result) => setCopied(result.exitCode === 0));
      }}
    >
      {copied ? <Check /> : <Copy />}{copied ? "Copied" : label}
    </Button>
  );
}

// ---------- shared helpers ----------

function personColor(data: RepositoryAnalytics, slot: number): string {
  return slot < data.personSlots ? SERIES_COLORS[slot] ?? OTHER_COLOR : OTHER_COLOR;
}

function slotLabel(data: RepositoryAnalytics, slot: number): string {
  return slot < data.personSlots ? data.people[slot]?.name ?? "Unknown" : "Everyone else";
}

/** Calendar days from the start of the window through today, inclusive. */
export function daysInWindow(from: number, to: number): number {
  const today = new Date(to * 1000);
  today.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((today.getTime() / 1000 - from) / 86_400) + 1);
}

function binTicks(range: AnalyticsRange) {
  return (plotWidth: number) => binAxisTicks(range.bins, range.unit, plotWidth);
}

function downsample(values: number[], points = 24): number[] {
  if (values.length <= points) return values;
  const size = values.length / points;
  return Array.from({ length: points }, (_, index) => {
    let total = 0;
    for (let position = Math.floor(index * size); position < Math.floor((index + 1) * size); position += 1) total += values[position] ?? 0;
    return total;
  });
}

function tagMarkers(data: RepositoryAnalytics, range: AnalyticsRange): Array<{ index: number; label: string; names: string[] }> {
  const groups = new Map<number, string[]>();
  for (const tag of data.tags) {
    if (tag.time < range.from || tag.time > range.to) continue;
    let index = range.bins.length - 1;
    while (index > 0 && range.bins[index]! > tag.time) index -= 1;
    const names = groups.get(index);
    if (names) names.push(tag.name);
    else groups.set(index, [tag.name]);
  }
  const collator = new Intl.Collator(undefined, { numeric: true });
  return [...groups.entries()].map(([index, names]) => {
    const sorted = [...names].sort(collator.compare);
    return { index, names: sorted, label: sorted.length > 1 ? `${sorted[0]}–${sorted.at(-1)}` : sorted[0]! };
  });
}

/** `.mailmap` lines that map every secondary identity to the person's most used one. */
export function mailmapEntries(person: AnalyticsPerson): string {
  const [canonical, ...others] = person.identities;
  if (!canonical) return "";
  return others.map((identity) => `${person.name} <${canonical.email}> ${identity.name} <${identity.email}>`).join("\n");
}

/**
 * Finds a sustained collapse in median duration, such as a test suite that
 * starts finishing in seconds. Returns the first bin of the collapse.
 */
export function findDurationDrop(values: ReadonlyArray<number | null>): { index: number; baseline: number; value: number } | null {
  const known = values.flatMap((value, index) => (value === null ? [] : [{ value, index }]));
  if (known.length < 4) return null;
  const half = Math.ceil(known.length / 2);
  const sorted = known.slice(0, half).map((entry) => entry.value).sort((a, b) => a - b);
  const baseline = sorted[sorted.length >> 1]!;
  if (baseline < 60) return null;
  for (let position = half; position < known.length; position += 1) {
    const entry = known[position]!;
    if (entry.value < baseline * 0.25 && known.slice(position).every((later) => later.value < baseline * 0.5)) {
      return { index: entry.index, baseline, value: entry.value };
    }
  }
  return null;
}

// ---------- Activity ----------

function ActivitySection({ data, range: rangeKey }: { data: RepositoryAnalytics; range: AnalyticsRangeKey }): ReactNode {
  const range = data.ranges[rangeKey];
  const option = RANGE_OPTIONS.find((item) => item.value === rangeKey)!;
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  const { kpis } = range;
  const totals = range.commits.map((bin) => bin.reduce((total, value) => total + value, 0));
  const spanDays = daysInWindow(range.from, range.to);
  const slotCount = data.personSlots + 1;
  const activeSlots = Array.from({ length: slotCount }, (_, slot) => slot).filter((slot) => range.commits.some((bin) => (bin[slot] ?? 0) > 0));
  const markers = tagMarkers(data, range);
  const series = activeSlots.filter((slot) => !hidden.has(slot)).map((slot) => ({
    key: String(slot),
    label: slotLabel(data, slot),
    color: personColor(data, slot),
    values: range.commits.map((bin) => bin[slot] ?? 0)
  }));
  const legendItems: LegendItem[] = activeSlots.map((slot) => ({ key: String(slot), label: slotLabel(data, slot), color: personColor(data, slot), hidden: hidden.has(slot) }));
  const toggle = (key: string) => setHidden((current) => {
    const next = new Set(current);
    const slot = Number(key);
    if (next.has(slot)) next.delete(slot);
    else next.add(slot);
    return next;
  });
  const commitsDelta = kpis.previousCommits === null ? null : { ...formatSignedChange(kpis.commits, kpis.previousCommits), upIsGood: true };
  const daysDelta = kpis.previousActiveDays === null ? null : { ...formatSignedChange(kpis.activeDays, kpis.previousActiveDays), upIsGood: true };
  const punchTotal = range.punchCard.reduce((total, value) => total + value, 0);
  const peak = range.punchCard.indexOf(Math.max(...range.punchCard));
  const lateNight = range.punchCard.reduce((total, value, index) => total + (index % 24 >= 22 || index % 24 < 4 ? value : 0), 0);
  const weekend = range.punchCard.slice(5 * 24).reduce((total, value) => total + value, 0);
  const days = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
  const hour = (value: number) => new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(new Date(2000, 0, 1, value));
  const merged = range.contributors.map((contributor) => data.people[contributor.person]).filter((person): person is AnalyticsPerson => Boolean(person && person.identities.length > 1));

  return (
    <div className="analytics-stack">
      <div className="analytics-kpis">
        <StatTile label="Commits" value={formatCount(kpis.commits)} delta={commitsDelta ? { ...commitsDelta, text: `${commitsDelta.text} vs ${option.period}` } : null} note={commitsDelta ? undefined : data.history.firstCommitAt ? `Since ${formatDate(data.history.firstCommitAt)}` : undefined} sparkline={downsample(totals)} />
        <StatTile label="Active days" value={formatCount(kpis.activeDays)} unit={`/ ${formatCount(spanDays)}`} delta={daysDelta ? { ...daysDelta, text: `${daysDelta.text} vs ${option.period}` } : null} note={daysDelta ? undefined : `${formatShare(kpis.activeDays / spanDays)} of days`} />
        <StatTile label="Lines changed" value={`+${formatCompact(kpis.linesAdded)}`} unit={`−${formatCompact(kpis.linesRemoved)}`} note={data.excludePaths ? "Text files, excluded paths skipped" : "All text files"} />
        <StatTile label="Asset revisions" value={formatCount(kpis.assetRevisions)} note="Binary and LFS file versions" />
      </div>
      <ChartCard
        title="Commit activity"
        description={`Commits per ${range.unit} by person${markers.length ? ". Vertical lines mark tags." : ""}`}
        legend={legendItems.length > 1 ? <ChartLegend items={legendItems} onToggle={toggle} /> : null}
        table={() => ({
          columns: [{ label: "Period" }, ...activeSlots.map((slot) => ({ label: slotLabel(data, slot), numeric: true })), { label: "Total", numeric: true }],
          rows: range.bins.flatMap((start, index) => totals[index] ? [[formatBinTitle(start, range.unit), ...activeSlots.map((slot) => range.commits[index]?.[slot] ?? 0), totals[index]!]] : [])
        })}
      >
        {kpis.commits ? (
          <ColumnChart
            ariaLabel={`Commits per ${range.unit}`}
            series={series}
            count={range.bins.length}
            height={220}
            xTicks={binTicks(range)}
            xLabel={(index) => formatBinAxisLabel(range.bins[index]!, range.unit)}
            tooltipTitle={(index) => formatBinTitle(range.bins[index]!, range.unit)}
            tooltipExtra={(index) => markers.filter((marker) => marker.index === index).flatMap((marker) => marker.names.map((name) => ({ value: name, label: "tag" })))}
            markers={markers}
          />
        ) : <EmptyChart text="No commits in this period." />}
      </ChartCard>
      <div className="analytics-two is-wide-end">
        <ChartCard
          title="When work happens"
          description="Commits by weekday and hour in each author's local time"
          table={() => ({
            columns: [{ label: "Day" }, ...Array.from({ length: 24 }, (_, value) => ({ label: hour(value), numeric: true }))],
            rows: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, row) => [day, ...range.punchCard.slice(row * 24, row * 24 + 24)])
          })}
        >
          {punchTotal ? (
            <>
              <PunchCard values={range.punchCard} ariaLabel="Commits by weekday and hour" />
              <p className="analytics-caption">
                Busiest: <strong>{days[Math.floor(peak / 24)]}, {hour(peak % 24)}</strong>. {formatShare(lateNight / punchTotal)} of commits land between 10 PM and 4 AM and {formatShare(weekend / punchTotal)} on weekends.
              </p>
            </>
          ) : <EmptyChart text="No commits in this period." />}
        </ChartCard>
        <ChartCard
          title="Contributors"
          description="People with merged identities, most active first"
          table={() => ({
            columns: [{ label: "Person" }, { label: "Commits", numeric: true }, { label: "Share", numeric: true }, { label: "Active days", numeric: true }, { label: "Lines added", numeric: true }, { label: "Lines removed", numeric: true }, { label: "Asset revisions", numeric: true }, { label: "Last commit" }],
            rows: range.contributors.map((contributor) => [
              data.people[contributor.person]?.name ?? "Unknown",
              contributor.commits,
              formatShare(kpis.commits ? contributor.commits / kpis.commits : 0),
              contributor.activeDays,
              contributor.linesAdded,
              contributor.linesRemoved,
              contributor.assetRevisions,
              formatDate(contributor.lastCommitAt)
            ])
          })}
        >
          {range.contributors.length ? (
            <>
              <div className="analytics-people" role="table" aria-label="Contributors">
                <div role="row" className="analytics-people-head">
                  <span role="columnheader">Person</span>
                  <span role="columnheader">Share</span>
                  <span role="columnheader" className="is-numeric">Commits</span>
                  <span role="columnheader" className="is-numeric">Active days</span>
                  <span role="columnheader" className="is-numeric">Lines</span>
                  <span role="columnheader" className="is-numeric">Assets</span>
                </div>
                {range.contributors.map((contributor) => {
                  const share = kpis.commits ? contributor.commits / kpis.commits : 0;
                  const color = personColor(data, Math.min(contributor.person, data.personSlots));
                  return (
                    <div role="row" key={contributor.person}>
                      <span role="cell" className="analytics-person"><i style={{ background: color }} aria-hidden="true" />{data.people[contributor.person]?.name}</span>
                      <span role="cell" className="analytics-share"><strong>{formatShare(share)}</strong><span><i style={{ width: `${Math.max(2, share * 100)}%`, background: color }} /></span></span>
                      <span role="cell" className="is-numeric">{formatCount(contributor.commits)}</span>
                      <span role="cell" className="is-numeric">{formatCount(contributor.activeDays)}</span>
                      <span role="cell" className="is-numeric">+{formatCompact(contributor.linesAdded)} −{formatCompact(contributor.linesRemoved)}</span>
                      <span role="cell" className="is-numeric">{formatCount(contributor.assetRevisions)}</span>
                    </div>
                  );
                })}
              </div>
              {merged.slice(0, 2).map((person) => {
                const emails = new Set(person.identities.map((identity) => identity.email.toLowerCase()));
                return (
                  <Notice key={person.name}>
                    <p><strong>{person.name}</strong> commits under {person.identities.length} identities across {emails.size} {emails.size === 1 ? "email" : "emails"}. Githead grouped them by shared emails and names. A <code>.mailmap</code> file makes this grouping apply in every Git tool.</p>
                    <div className="analytics-identities">
                      {person.identities.map((identity) => <span key={`${identity.name}<${identity.email}>`}>{identity.name} &lt;{identity.email}&gt;<em>{formatCount(identity.commits)}</em></span>)}
                    </div>
                    <CopyButton text={mailmapEntries(person)} label="Copy .mailmap entries" />
                  </Notice>
                );
              })}
            </>
          ) : <EmptyChart text="No commits in this period." />}
        </ChartCard>
      </div>
    </div>
  );
}

function EmptyChart({ text }: { text: string }): ReactNode {
  return <p className="analytics-chart-empty">{text}</p>;
}

// ---------- Code ----------

function CodeSection({ data, range: rangeKey, canOpenFileHistory, onOpenFileHistory }: {
  data: RepositoryAnalytics;
  range: AnalyticsRangeKey;
  canOpenFileHistory: boolean;
  onOpenFileHistory: (path: string, headHash: string) => void;
}): ReactNode {
  const range = data.ranges[rangeKey];
  const openFile = canOpenFileHistory && data.headHash ? (path: string) => onOpenFileHistory(path, data.headHash!) : null;
  const hotspotRows: BarRow[] = range.hotspots.map((file) => ({
    key: file.path,
    label: file.path,
    isPath: true,
    segments: [{ value: file.commits, color: SERIES_COLORS[0]! }],
    display: <><strong>{formatCount(file.commits)}</strong> commits</>,
    tooltip: { title: file.path, rows: [{ value: formatCount(file.commits), label: "commits" }, { value: `+${formatCount(file.linesAdded)} −${formatCount(file.linesRemoved)}`, label: "lines" }, { value: formatCount(file.authors), label: file.authors === 1 ? "author" : "authors" }] },
    ...(openFile ? { onSelect: () => openFile(file.path), selectLabel: `Open file history for ${file.path}` } : {})
  }));
  const slotCount = data.personSlots + 1;
  const ownershipSlots = Array.from({ length: slotCount }, (_, slot) => slot).filter((slot) => range.ownership.some((folder) => (folder.revisions[slot] ?? 0) > 0));
  const folderLabel = (folder: string) => (folder === "" ? "Root files" : folder.endsWith("/*") ? `${folder.slice(0, -2)} (files)` : folder);
  const ownershipRows: BarRow[] = range.ownership.map((folder) => {
    const total = folder.revisions.reduce((sum, value) => sum + value, 0) || 1;
    const top = folder.revisions.indexOf(Math.max(...folder.revisions));
    return {
      key: folder.folder,
      label: folderLabel(folder.folder),
      segments: folder.revisions.map((value, slot) => ({ value: value / total, color: personColor(data, slot) })),
      display: <><strong>{formatShare((folder.revisions[top] ?? 0) / total)}</strong> {slotLabel(data, top)}</>,
      tooltip: {
        title: folderLabel(folder.folder),
        rows: folder.revisions.flatMap((value, slot) => (value ? [{ value: formatShare(value / total), label: `${slotLabel(data, slot)} · ${formatCount(value)} revisions`, color: personColor(data, slot) }] : []))
      }
    };
  });
  const concentrated = range.ownership.filter((folder) => {
    const total = folder.revisions.reduce((sum, value) => sum + value, 0);
    return total > 0 && Math.max(...folder.revisions) / total >= 0.9;
  });
  const minority = range.ownership.filter((folder) => {
    const total = folder.revisions.reduce((sum, value) => sum + value, 0);
    const top = folder.revisions.indexOf(Math.max(...folder.revisions));
    return total > 0 && top !== 0 && (folder.revisions[top] ?? 0) / total >= 0.5;
  });
  const sizeColors = [NEUTRAL_COLOR, ...ORDINAL_COLORS];

  return (
    <div className="analytics-stack">
      <div className="analytics-two">
        <ChartCard
          title="Hotspots"
          description={openFile ? "Text files changed in the most commits. Select a file to open its history." : "Text files changed in the most commits"}
          table={() => ({
            columns: [{ label: "File" }, { label: "Commits", numeric: true }, { label: "Added", numeric: true }, { label: "Removed", numeric: true }, { label: "Authors", numeric: true }],
            rows: range.hotspots.map((file) => [file.path, file.commits, file.linesAdded, file.linesRemoved, file.authors])
          })}
        >
          {hotspotRows.length ? <BarList rows={hotspotRows} ariaLabel="Hotspots" /> : <EmptyChart text="No text file changes in this period." />}
        </ChartCard>
        <ChartCard
          title="Who knows what"
          description="Share of file revisions per folder, counting text and binary files"
          legend={ownershipSlots.length > 1 ? <ChartLegend items={ownershipSlots.map((slot) => ({ key: String(slot), label: slotLabel(data, slot), color: personColor(data, slot) }))} /> : null}
          table={() => ({
            columns: [{ label: "Folder" }, ...ownershipSlots.map((slot) => ({ label: slotLabel(data, slot), numeric: true })), { label: "Total", numeric: true }],
            rows: range.ownership.map((folder) => [folderLabel(folder.folder), ...ownershipSlots.map((slot) => folder.revisions[slot] ?? 0), folder.revisions.reduce((sum, value) => sum + value, 0)])
          })}
        >
          {ownershipRows.length ? (
            <>
              <BarList rows={ownershipRows} max={1} ariaLabel="Folder ownership" />
              {concentrated.length ? (
                <Notice>
                  <strong>{concentrated.length} of {range.ownership.length} folders</strong> have one person making 90% or more of the changes.
                  {minority.length ? <> <strong>{minority.map((folder) => folderLabel(folder.folder)).join(", ")}</strong> {minority.length === 1 ? "is" : "are"} mostly someone else's work.</> : null}
                </Notice>
              ) : null}
            </>
          ) : <EmptyChart text="No file changes in this period." />}
        </ChartCard>
      </div>
      <ChartCard
        title="Lines added and removed"
        description={`Text lines per ${range.unit}${data.excludePaths ? ", excluded paths skipped" : ""}`}
        legend={<ChartLegend items={[{ key: "added", label: "Added", color: POSITIVE_COLOR }, { key: "removed", label: "Removed", color: NEGATIVE_COLOR }]} />}
        table={() => ({
          columns: [{ label: "Period" }, { label: "Added", numeric: true }, { label: "Removed", numeric: true }, { label: "Net", numeric: true }],
          rows: range.bins.flatMap((start, index) => {
            const [added, removed] = range.lines[index] ?? [0, 0];
            return added || removed ? [[formatBinTitle(start, range.unit), added, removed, added - removed]] : [];
          })
        })}
      >
        {range.kpis.linesAdded || range.kpis.linesRemoved ? (
          <DivergingColumnChart
            ariaLabel="Lines added and removed"
            positive={range.lines.map((line) => line[0])}
            negative={range.lines.map((line) => line[1])}
            positiveLabel="lines added"
            negativeLabel="lines removed"
            xTicks={binTicks(range)}
            xLabel={(index) => formatBinAxisLabel(range.bins[index]!, range.unit)}
            tooltipTitle={(index) => formatBinTitle(range.bins[index]!, range.unit)}
          />
        ) : <EmptyChart text="No text line changes in this period." />}
      </ChartCard>
      <div className="analytics-two">
        <ChartCard
          title="Files that change together"
          description="Pairs committed together most often. The bar shows how often the less-changed file moves with its pair."
          table={() => ({
            columns: [{ label: "File A" }, { label: "File B" }, { label: "Together", numeric: true }, { label: "A commits", numeric: true }, { label: "B commits", numeric: true }],
            rows: range.coupling.map((pair) => [pair.pathA, pair.pathB, pair.together, pair.commitsA, pair.commitsB])
          })}
        >
          {range.coupling.length ? (
            <div className="analytics-pairs" role="list" aria-label="Files that change together">
              {range.coupling.map((pair) => {
                const rate = pair.together / Math.max(1, Math.min(pair.commitsA, pair.commitsB));
                const a = splitPath(pair.pathA);
                const b = splitPath(pair.pathB);
                return (
                  <div key={`${pair.pathA}\n${pair.pathB}`} role="listitem" className="analytics-pair">
                    <div className="analytics-pair-files">
                      <span title={pair.pathA}><b>{a.name}</b><span>{a.folder}</span></span>
                      <span title={pair.pathB}><b>↔ {b.name}</b><span>{b.folder}</span></span>
                    </div>
                    <span className="analytics-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, rate * 100)}%` }} /></span>
                    <span className="analytics-pair-value"><strong>{formatCount(pair.together)}</strong> together · {formatPercent(Math.min(1, rate))}</span>
                  </div>
                );
              })}
            </div>
          ) : <EmptyChart text="No files changed together at least three times in this period." />}
        </ChartCard>
        <ChartCard
          title="Commit size"
          description="Commits by text lines changed. Assets commits change no text lines."
          table={() => ({ columns: [{ label: "Lines changed" }, { label: "Commits", numeric: true }], rows: COMMIT_SIZE_LABELS.map((label, index) => [label, range.commitSizes[index] ?? 0]) })}
        >
          {range.commitSizes.some(Boolean) ? (
            <ColumnChart
              ariaLabel="Commits by size"
              count={COMMIT_SIZE_LABELS.length}
              series={COMMIT_SIZE_LABELS.map((label, index) => ({ key: label, label: "commits", color: sizeColors[index]!, values: range.commitSizes.map((value, position) => (position === index ? value : 0)) }))}
              height={200}
              maxBarWidth={48}
              xTicks={() => COMMIT_SIZE_LABELS.map((_, index) => index)}
              xLabel={(index) => COMMIT_SIZE_LABELS[index]!}
              tooltipTitle={(index) => (index === 0 ? "No text lines" : `${COMMIT_SIZE_LABELS[index]} lines`)}
              valueLabel={(index) => formatCount(range.commitSizes[index] ?? 0)}
            />
          ) : <EmptyChart text="No commits in this period." />}
        </ChartCard>
      </div>
    </div>
  );
}

// ---------- Assets ----------

function AssetsSection({ data, canOpenFileHistory, onOpenFileHistory }: {
  data: RepositoryAnalytics;
  canOpenFileHistory: boolean;
  onOpenFileHistory: (path: string, headHash: string) => void;
}): ReactNode {
  const { assets } = data;
  const openFile = canOpenFileHistory && data.headHash ? (path: string) => onOpenFileHistory(path, data.headHash!) : null;
  const growth = useMemo(() => {
    let total = 0;
    return assets.lfsGrowth.map((month) => (total += month.bytes) / 1e9);
  }, [assets.lfsGrowth]);
  const months = assets.lfsGrowth.map((month) => month.month);
  const totalBytes = assets.lfsBytes + assets.gitBytes;
  const types = [...assets.types, ...(assets.otherTypes ? [{ ...assets.otherTypes, extension: "Other types" }] : [])];
  const typeRows: BarRow[] = types.map((type) => {
    const bytes = type.lfsBytes + type.gitBytes;
    return {
      key: type.extension || "(none)",
      label: type.extension || "No extension",
      segments: [{ value: type.lfsBytes, color: SERIES_COLORS[0]! }, { value: type.gitBytes, color: SERIES_COLORS[1]! }],
      display: <><strong>{formatBytes(bytes)}</strong> · {formatShare(totalBytes ? bytes / totalBytes : 0)}</>,
      tooltip: { title: type.extension || "No extension", rows: [{ value: formatBytes(type.lfsBytes), label: "in LFS", color: SERIES_COLORS[0]! }, { value: formatBytes(type.gitBytes), label: "in Git", color: SERIES_COLORS[1]! }, { value: formatCount(type.files), label: "files" }] }
    };
  });
  const binaryRows: BarRow[] = assets.binaryHotspots.map((file) => ({
    key: file.path,
    label: file.path,
    isPath: true,
    segments: [{ value: file.revisions, color: SERIES_COLORS[0]! }],
    display: <><strong>{formatCount(file.revisions)}</strong>{file.lfsBytes !== null ? ` · ${formatBytes(file.lfsBytes)}` : ""}</>,
    tooltip: { title: file.path, rows: [{ value: formatCount(file.revisions), label: "revisions" }, ...(file.lfsBytes !== null ? [{ value: formatBytes(file.lfsBytes), label: "stored across versions" }] : [])] },
    ...(openFile ? { onSelect: () => openFile(file.path), selectLabel: `Open file history for ${file.path}` } : {})
  }));
  const rules = assets.binaryTypesOutsideLfs.map((type) => `*${type.extension} filter=lfs diff=lfs merge=lfs -text`).join("\n");
  const oldShare = assets.lfsHistoryBytes > 0 ? Math.max(0, 1 - assets.lfsBytes / assets.lfsHistoryBytes) : null;

  return (
    <div className="analytics-stack">
      <div className="analytics-kpis">
        <StatTile label="LFS in current tree" value={formatBytes(assets.lfsBytes)} note={`${formatCount(assets.lfsFiles)} files at HEAD`} />
        <StatTile label="LFS across history" value={formatBytes(assets.lfsHistoryBytes)} note={oldShare !== null ? `${formatShare(oldShare)} is older versions` : "No LFS versions in history"} />
        <StatTile label="Git pack size" value={assets.packedBytes === null ? "–" : formatBytes(assets.packedBytes)} note={`${formatBytes(assets.gitBytes)} of regular files at HEAD`} />
        <StatTile label="Large files outside LFS" value={formatCount(assets.largeFilesOutsideLfsCount)} note="Over 1 MB, stored as Git blobs" />
      </div>
      <ChartCard
        title="LFS storage growth"
        description="Cumulative size of every LFS version committed. The LFS server keeps each version in full."
        table={() => ({
          columns: [{ label: "Month" }, { label: "Added", numeric: true }, { label: "Cumulative", numeric: true }],
          rows: assets.lfsGrowth.flatMap((month, index) => (month.bytes ? [[formatBinTitle(month.month, "month"), formatBytes(month.bytes), `${growth[index]!.toFixed(2)} GB`]] : []))
        })}
      >
        {assets.lfsHistoryBytes > 0 ? (
          <LineChart
            ariaLabel="Cumulative LFS storage"
            series={[{ key: "lfs", label: "LFS stored", color: SERIES_COLORS[0]!, values: growth }]}
            area
            height={220}
            {...(assets.lfsBytes > 0 ? { reference: { value: assets.lfsBytes / 1e9, label: `Current tree · ${formatBytes(assets.lfsBytes)}` } } : {})}
            xTicks={(plotWidth) => binAxisTicks(months, "month", plotWidth)}
            xLabel={(index) => formatBinAxisLabel(months[index]!, "month")}
            tooltipTitle={(index) => formatBinTitle(months[index]!, "month")}
            tooltipExtra={(index) => [{ value: formatBytes(assets.lfsGrowth[index]?.bytes ?? 0), label: "added this month" }]}
            yFormat={(value) => `${formatCompact(value)} GB`}
            valueFormat={(value) => formatBytes(value * 1e9)}
            endLabel={(value) => formatBytes(value * 1e9)}
          />
        ) : <EmptyChart text="No LFS files in the analyzed history." />}
      </ChartCard>
      <div className="analytics-two">
        <ChartCard
          title="Repository weight by file type"
          description="Files at HEAD by real size, with LFS pointers resolved"
          legend={<ChartLegend items={[{ key: "lfs", label: "In LFS", color: SERIES_COLORS[0]! }, { key: "git", label: "In Git", color: SERIES_COLORS[1]! }]} />}
          table={() => ({
            columns: [{ label: "Type" }, { label: "Files", numeric: true }, { label: "In LFS", numeric: true }, { label: "In Git", numeric: true }],
            rows: types.map((type) => [type.extension || "No extension", type.files, formatBytes(type.lfsBytes), formatBytes(type.gitBytes)])
          })}
        >
          {typeRows.length ? <BarList rows={typeRows} ariaLabel="Repository weight by file type" /> : <EmptyChart text="The repository has no files at HEAD." />}
        </ChartCard>
        <ChartCard
          title="Most-revised binary assets"
          description={openFile ? "Each revision stores another full copy. Select a file to open its history." : "Each revision stores another full copy"}
          table={() => ({
            columns: [{ label: "File" }, { label: "Revisions", numeric: true }, { label: "Stored", numeric: true }],
            rows: assets.binaryHotspots.map((file) => [file.path, file.revisions, file.lfsBytes === null ? "–" : formatBytes(file.lfsBytes)])
          })}
        >
          {binaryRows.length ? <BarList rows={binaryRows} ariaLabel="Most-revised binary assets" /> : <EmptyChart text="No binary files in the analyzed history." />}
        </ChartCard>
      </div>
      <ChartCard
        title="Should these be in LFS?"
        description="Binary files stored as regular Git blobs make every clone and fetch larger"
        actions={rules ? <CopyButton text={rules} label="Copy LFS rules" /> : null}
      >
        {assets.binaryTypesOutsideLfs.length || assets.largeFilesOutsideLfs.length ? (
          <>
            {assets.binaryTypesOutsideLfs.length ? (
              <table className="analytics-table">
                <caption className="sr-only">Binary file types stored in Git</caption>
                <thead><tr><th scope="col">Type</th><th scope="col">Largest file</th><th scope="col" className="is-numeric">Files</th><th scope="col" className="is-numeric">Size</th></tr></thead>
                <tbody>
                  {assets.binaryTypesOutsideLfs.map((type) => (
                    <tr key={type.extension}><td><code>*{type.extension}</code></td><td className="analytics-muted-cell" title={type.example}>{type.example}</td><td className="is-numeric">{formatCount(type.files)}</td><td className="is-numeric">{formatBytes(type.gitBytes)}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {assets.largeFilesOutsideLfs.length ? (
              <table className="analytics-table">
                <caption className="sr-only">Large files stored in Git</caption>
                <thead><tr><th scope="col">Large file</th><th scope="col" className="is-numeric">Size</th></tr></thead>
                <tbody>{assets.largeFilesOutsideLfs.map((file) => <tr key={file.path}><td title={file.path}>{file.path}</td><td className="is-numeric">{formatBytes(file.bytes)}</td></tr>)}</tbody>
              </table>
            ) : null}
            {rules ? (
              <Notice>
                <p>Add these rules to <code>.gitattributes</code> to store new versions in LFS. Files already committed stay in Git history until you run <code>git lfs migrate</code>, which rewrites history.</p>
                <pre className="analytics-code">{rules}</pre>
              </Notice>
            ) : null}
          </>
        ) : <p className="analytics-chart-empty"><CircleCheck aria-hidden="true" /> No binary file types or files over 1 MB are stored outside LFS.</p>}
      </ChartCard>
    </div>
  );
}

// ---------- Branches ----------

function BranchesSection({ data, onOpenBranchManager }: { data: RepositoryAnalytics; onOpenBranchManager: () => void }): ReactNode {
  const { base, branches, truncated } = data.branches;
  const sorted = [...branches].sort((a, b) => (b.ahead ?? -1) - (a.ahead ?? -1) || b.lastCommitAt - a.lastCommitAt);
  const merged = branches.filter((branch) => branch.ahead === 0);
  const unmerged = branches.filter((branch) => (branch.ahead ?? 0) > 0);
  const oldest = branches.reduce<typeof branches[number] | null>((current, branch) => (!current || branch.lastCommitAt < current.lastCommitAt ? branch : current), null);
  const current = branches.find((branch) => branch.current);
  const maxAhead = Math.max(1, ...branches.map((branch) => branch.ahead ?? 0));
  const maxBehind = Math.max(1, ...branches.map((branch) => branch.behind ?? 0));

  return (
    <div className="analytics-stack">
      <div className="analytics-kpis">
        <StatTile label="Branches" value={formatCount(branches.length)} note={truncated ? "Most recent 200 local and remote" : "Local and remote"} />
        <StatTile label="Fully merged" value={formatCount(merged.length)} note={base ? `No commits missing from ${base}` : "No base branch"} />
        <StatTile label="With unmerged work" value={formatCount(unmerged.length)} note={`${formatCount(unmerged.reduce((total, branch) => total + (branch.ahead ?? 0), 0))} commits in total`} />
        <StatTile label="Oldest branch tip" value={oldest ? formatDate(oldest.lastCommitAt) : "–"} note={oldest?.name} />
      </div>
      <ChartCard
        title="Branch drift"
        description={base ? `Ahead: commits ${base} doesn't have. Behind: commits on ${base} the branch doesn't have.` : "No remote default branch, upstream, or current branch to compare with."}
        actions={<Button type="button" variant="outline" size="xs" onClick={onOpenBranchManager}><GitBranch />Manage branches</Button>}
      >
        {sorted.length ? (
          <>
            <table className="analytics-table analytics-drift">
              <caption className="sr-only">Branch drift</caption>
              <thead><tr><th scope="col">Branch</th><th scope="col">Last commit</th><th scope="col">Ahead</th><th scope="col">Behind</th></tr></thead>
              <tbody>
                {sorted.map((branch) => (
                  <tr key={branch.name}>
                    <td className="analytics-drift-name" title={branch.name}>
                      <span>{branch.name}</span>
                      {branch.current ? <Badge variant="secondary">current</Badge> : null}
                      {!branch.remote && !branch.current ? <Badge variant="outline">local</Badge> : null}
                      {branch.ahead === 0 ? <Badge variant="outline">merged</Badge> : null}
                    </td>
                    <td className="analytics-muted-cell">{formatDate(branch.lastCommitAt)}</td>
                    <td><MiniBar value={branch.ahead} max={maxAhead} color={POSITIVE_COLOR} /></td>
                    <td><MiniBar value={branch.behind} max={maxBehind} color={NEUTRAL_COLOR} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {merged.length || (current?.behind ?? 0) > 0 ? (
              <Notice>
                {merged.length ? <><strong>{formatCount(merged.length)} {merged.length === 1 ? "branch is" : "branches are"} fully merged</strong> into {base} and can be removed. </> : null}
                {current && (current.behind ?? 0) > 0 ? <><strong>{current.name} is {formatCount(current.behind!)} commits behind</strong> {base}.</> : null}
              </Notice>
            ) : null}
          </>
        ) : <EmptyChart text="No other branches." />}
      </ChartCard>
    </div>
  );
}

function MiniBar({ value, max, color }: { value: number | null; max: number; color: string }): ReactNode {
  if (value === null) return <span className="analytics-muted-cell">–</span>;
  return (
    <span className="analytics-minibar">
      <span className="is-numeric">{formatCount(value)}</span>
      {value > 0 ? <i style={{ width: `${Math.max(2, (value / max) * 72)}px`, background: color }} aria-hidden="true" /> : null}
    </span>
  );
}

// ---------- CI ----------

function CiSection({ data, failure, renderFailure, onOpenWorkflowRuns }: {
  data: GitHubWorkflowAnalytics;
  failure: GitHubFailure | null;
  renderFailure: (failure: GitHubFailure) => ReactNode;
  onOpenWorkflowRuns: (branch: string) => void;
}): ReactNode {
  const completed = data.passed + data.failed + data.cancelled;
  const labels = data.bins.map((start) => formatBinAxisLabel(start, data.unit));
  const title = (index: number) => formatBinTitle(data.bins[index]!, data.unit);
  const ticks = (plotWidth: number) => binAxisTicks(data.bins, data.unit, plotWidth, 70);
  const durationSeries = data.workflows.slice(0, 3).map((workflow, index) => ({
    key: workflow.name,
    label: workflow.name,
    color: SERIES_COLORS[index]!,
    values: workflow.medianDurations.map((value) => (value === null ? null : value / 60))
  }));
  const drops = data.workflows.slice(0, 3).flatMap((workflow) => {
    const drop = findDurationDrop(workflow.medianDurations);
    return drop ? [{ workflow: workflow.name, ...drop }] : [];
  });
  const primary = data.workflows[0];
  const failingRows: BarRow[] = data.failingBranches.map((branch) => ({
    key: branch.branch,
    label: branch.branch,
    badge: branch.runs >= 5 && branch.passed / branch.runs < 0.1 ? <Badge variant="outline" className="ml-2">{formatCount(branch.passed)} passed</Badge> : null,
    segments: [{ value: branch.failed, color: CRITICAL_COLOR }],
    display: <><strong>{formatCount(branch.failed)}</strong> of {formatCount(branch.runs)} runs</>,
    tooltip: { title: branch.branch, rows: [{ value: formatCount(branch.failed), label: "failed", color: CRITICAL_COLOR }, { value: formatCount(branch.passed), label: "passed", color: GOOD_COLOR }, { value: formatCount(branch.runs - branch.failed - branch.passed), label: "cancelled", color: NEUTRAL_COLOR }] },
    onSelect: () => onOpenWorkflowRuns(branch.branch),
    selectLabel: `Show workflow runs for ${branch.branch}`
  }));
  const rateDelta = data.successRate !== null && data.previousSuccessRate !== null ? { ...formatPointChange(data.successRate, data.previousSuccessRate), upIsGood: true } : null;

  return (
    <div className="analytics-stack">
      {failure ? renderFailure(failure) : null}
      {data.sampled ? <Notice>Showing the newest 1,000 runs. Older runs in this period were not loaded.</Notice> : null}
      <div className="analytics-kpis">
        <StatTile label="Success rate" value={data.successRate === null ? "–" : formatPercent(data.successRate, 1)} delta={rateDelta ? { ...rateDelta, text: `${rateDelta.text} vs previous period` } : null} note={rateDelta ? undefined : "Cancelled runs excluded"} sparkline={data.outcomes.map(([passed, failed]) => (passed + failed ? passed / (passed + failed) : 0))} />
        <StatTile label="Failed runs" value={formatCount(data.failed)} note={`Of ${formatCount(completed)} completed runs, ${formatCount(data.cancelled)} cancelled`} />
        <StatTile label={primary ? `Median ${primary.name}` : "Median duration"} value={formatDuration(primary?.medianDurationSeconds ?? null)} note="Successful runs" />
        <StatTile label="Re-runs" value={formatCount(data.reruns)} note="Runs on a second or later attempt" />
      </div>
      <div className="analytics-two">
        <ChartCard
          title="Run outcomes"
          description={`Completed runs per ${data.unit}`}
          legend={<ChartLegend items={[
            { key: "passed", label: "Passed", color: GOOD_COLOR, icon: <CircleCheck className="analytics-status-icon" style={{ color: GOOD_COLOR }} aria-hidden="true" /> },
            { key: "failed", label: "Failed", color: CRITICAL_COLOR, icon: <CircleX className="analytics-status-icon" style={{ color: CRITICAL_COLOR }} aria-hidden="true" /> },
            { key: "cancelled", label: "Cancelled", color: NEUTRAL_COLOR, icon: <CircleMinus className="analytics-status-icon" style={{ color: NEUTRAL_COLOR }} aria-hidden="true" /> }
          ]} />}
          table={() => ({
            columns: [{ label: "Period" }, { label: "Passed", numeric: true }, { label: "Failed", numeric: true }, { label: "Cancelled", numeric: true }],
            rows: data.outcomes.map((outcome, index) => [title(index), ...outcome])
          })}
        >
          {completed ? (
            <ColumnChart
              ariaLabel="Workflow run outcomes"
              count={data.bins.length}
              series={[
                { key: "passed", label: "passed", color: GOOD_COLOR, values: data.outcomes.map((outcome) => outcome[0]) },
                { key: "failed", label: "failed", color: CRITICAL_COLOR, values: data.outcomes.map((outcome) => outcome[1]) },
                { key: "cancelled", label: "cancelled", color: NEUTRAL_COLOR, values: data.outcomes.map((outcome) => outcome[2]) }
              ]}
              xTicks={ticks}
              xLabel={(index) => labels[index]!}
              tooltipTitle={title}
              tooltipExtra={(index) => {
                const [passed, failed] = data.outcomes[index] ?? [0, 0];
                return passed + failed ? [{ value: formatPercent(passed / (passed + failed)), label: "success rate" }] : [];
              }}
            />
          ) : <EmptyChart text="No completed runs in this period." />}
        </ChartCard>
        <ChartCard
          title="Median run time"
          description={`Successful runs per ${data.unit}, by workflow`}
          legend={durationSeries.length > 1 ? <ChartLegend items={durationSeries.map((item) => ({ key: item.key, label: item.label, color: item.color, shape: "line" }))} /> : null}
          table={() => ({
            columns: [{ label: "Period" }, ...data.workflows.slice(0, 3).map((workflow) => ({ label: workflow.name, numeric: true }))],
            rows: data.bins.map((_, index) => [title(index), ...data.workflows.slice(0, 3).map((workflow) => formatDuration(workflow.medianDurations[index] ?? null))])
          })}
        >
          {durationSeries.some((item) => item.values.some((value) => value !== null)) ? (
            <>
              <LineChart
                ariaLabel="Median workflow run time"
                series={durationSeries}
                xTicks={ticks}
                xLabel={(index) => labels[index]!}
                tooltipTitle={title}
                yFormat={(value) => `${formatCompact(value)}m`}
                valueFormat={(value) => formatDuration(value * 60)}
                endLabel={(value) => formatDuration(value * 60)}
              />
              {drops.map((drop) => (
                <Notice key={drop.workflow} tone="warning">
                  <strong>{drop.workflow} dropped from {formatDuration(drop.baseline)} to {formatDuration(drop.value)}</strong> starting {title(drop.index).replace(/^Week of/, "the week of")}. Successful runs this short can mean tests are being skipped.
                </Notice>
              ))}
            </>
          ) : <EmptyChart text="No successful runs in this period." />}
        </ChartCard>
      </div>
      <ChartCard
        title="Where failures happen"
        description="Branches with the most failed runs. Select a branch to see its runs."
        table={() => ({
          columns: [{ label: "Branch" }, { label: "Failed", numeric: true }, { label: "Passed", numeric: true }, { label: "Runs", numeric: true }],
          rows: data.failingBranches.map((branch) => [branch.branch, branch.failed, branch.passed, branch.runs])
        })}
      >
        {failingRows.length ? <BarList rows={failingRows} ariaLabel="Branches with failed runs" /> : <p className="analytics-chart-empty"><CircleCheck aria-hidden="true" /> No failed runs in this period.</p>}
      </ChartCard>
    </div>
  );
}

// ---------- Excluded paths ----------

function ExcludedPathsDialog({ open, repoPath, onOpenChange, onSaved }: {
  open: boolean;
  repoPath: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}): ReactNode {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const textareaId = "analytics-excluded-paths";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void window.githead.getRepositoryAnalyticsSettings({ repoPath }).then((settings) => {
      if (!cancelled) setText(settings.excludedPaths.join("\n"));
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to read excluded paths.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, repoPath]);

  const save = async (): Promise<void> => {
    setSaving(true);
    setError("");
    try {
      await window.githead.saveRepositoryAnalyticsSettings({ repoPath, excludedPaths: text.split(/\r?\n/) });
      onOpenChange(false);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save excluded paths.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Excluded paths</DialogTitle>
          <DialogDescription>
            Vendored and generated paths to skip in line counts, hotspots, ownership, and coupling. Commits still count toward activity.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor={textareaId}>Patterns, one per line</Label>
          <Textarea id={textareaId} value={text} disabled={loading || saving} rows={8} spellCheck={false} className="font-mono text-xs" onChange={(event) => setText(event.target.value)} />
          <p className="text-xs text-muted-foreground">
            Uses <code>.gitignore</code> style: <code>Plugins/</code> matches that folder at any depth, <code>Content/*/</code> matches each folder inside Content, and <code>!Content/Game/</code> includes a folder again. Later lines win.
          </p>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="ghost" disabled={loading || saving} onClick={() => setText(DEFAULT_ANALYTICS_EXCLUDED_PATHS.join("\n"))}>Restore defaults</Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" disabled={loading || saving} onClick={() => { void save(); }}>{saving ? "Saving" : "Save"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
