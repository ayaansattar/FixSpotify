"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  InsightsData,
  PlaysOverTimeRange,
  RankMode,
} from "@/lib/insights";

const CHART_GREEN = "#1ed760";
const CHART_AMBER = "#e6b422";
const CHART_RED = "#e25555";
const CHART_BLUE = "#5b9fd4";
const CHART_TICK = "#d7ddd9";
const CHART_GRID = "rgba(255,255,255,0.08)";
const TOOLTIP_STYLE = {
  backgroundColor: "#111713",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  color: "#f4f7f5",
};
const TOOLTIP_LABEL_STYLE = { color: "#f4f7f5" };
const TOOLTIP_ITEM_STYLE = { color: "#d7ddd9" };
const AXIS_TICK = { fill: CHART_TICK, fontSize: 12 };
const AXIS_TICK_SMALL = { fill: CHART_TICK, fontSize: 11 };

function truncateLabel(value: string, max = 18) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function healthFill(score: number) {
  if (score >= 70) return CHART_GREEN;
  if (score >= 40) return CHART_AMBER;
  return CHART_RED;
}

const TIME_RANGES: Array<{ value: PlaysOverTimeRange; label: string }> = [
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "lifetime", label: "Lifetime" },
];

const RANK_MODES: Array<{ value: RankMode; label: string }> = [
  { value: "most", label: "Most" },
  { value: "least", label: "Least" },
];

type InsightsChartsProps = {
  data: InsightsData;
};

export function InsightsCharts({ data }: InsightsChartsProps) {
  const [timeRange, setTimeRange] = useState<PlaysOverTimeRange>("year");
  const [trackRank, setTrackRank] = useState<RankMode>("most");
  const [artistRank, setArtistRank] = useState<RankMode>("most");

  const playsOverTime = data.playsOverTime[timeRange];
  const tracks = data.tracksByPlays[trackRank];
  const artists = data.artistsByPlays[artistRank];
  const playlistHealth = data.playlistHealth;
  const playlistChartHeight = Math.max(240, playlistHealth.length * 32);

  const timeDescription = useMemo(() => {
    if (timeRange === "month") {
      return "Daily listening volume for the last 30 days.";
    }
    if (timeRange === "year") {
      return "Monthly listening volume for the last 12 months.";
    }
    return "Monthly listening volume across your full imported history.";
  }, [timeRange]);

  const neverPlayedShare =
    data.summary.uniquePlaylistTracks === 0
      ? 0
      : Math.round(
          (data.summary.neverPlayed / data.summary.uniquePlaylistTracks) * 100,
        );

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Plays logged"
          value={data.summary.totalPlays.toLocaleString()}
        />
        <StatCard
          label="Unique tracks in playlists"
          value={data.summary.uniquePlaylistTracks.toLocaleString()}
        />
        <StatCard
          label="Never played"
          value={`${data.summary.neverPlayed.toLocaleString()} (${neverPlayedShare}%)`}
        />
        <StatCard
          label="Unavailable tracks"
          value={data.summary.unplayable.toLocaleString()}
        />
        <StatCard
          label="Avg playlist health"
          value={`${data.summary.avgPlaylistHealth}/100`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard
          actions={
            <RankToggle value={trackRank} onChange={setTrackRank} />
          }
          description={
            trackRank === "most"
              ? "Your most-played tracks across preferred playlists (lifetime)."
              : "Your least-played tracks across preferred playlists (lifetime), including never played."
          }
          title="Songs by plays"
        >
          <ResponsiveContainer height={420} width="100%">
            <BarChart
              data={tracks}
              layout="vertical"
              margin={{ left: 8, right: 12, top: 4, bottom: 4 }}
            >
              <CartesianGrid stroke={CHART_GRID} horizontal={false} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="track"
                width={128}
                interval={0}
                tick={AXIS_TICK_SMALL}
                tickFormatter={(value) => truncateLabel(String(value))}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                cursor={{ fill: "rgba(30,215,96,0.08)" }}
                formatter={(value, _name, item) => {
                  const artist =
                    item &&
                    typeof item === "object" &&
                    "payload" in item &&
                    item.payload &&
                    typeof item.payload === "object" &&
                    "artist" in item.payload
                      ? String(item.payload.artist)
                      : "";
                  return [
                    typeof value === "number"
                      ? `${value.toLocaleString()} plays${
                          artist ? ` · ${artist}` : ""
                        }`
                      : value,
                    "Listening",
                  ];
                }}
              />
              <Bar dataKey="plays" radius={[0, 8, 8, 0]}>
                {tracks.map((row) => (
                  <Cell
                    fill={CHART_GREEN}
                    key={`${row.track}-${row.artist}-${row.plays}`}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          actions={
            <RankToggle value={artistRank} onChange={setArtistRank} />
          }
          description={
            artistRank === "most"
              ? "Artists with the most lifetime plays in your preferred playlists."
              : "Artists with the fewest lifetime plays in your preferred playlists."
          }
          title="Artists by plays"
        >
          <ResponsiveContainer height={420} width="100%">
            <BarChart
              data={artists}
              layout="vertical"
              margin={{ left: 8, right: 12, top: 4, bottom: 4 }}
            >
              <CartesianGrid stroke={CHART_GRID} horizontal={false} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="artist"
                width={118}
                interval={0}
                tick={AXIS_TICK_SMALL}
                tickFormatter={(value) => truncateLabel(String(value))}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                cursor={{ fill: "rgba(30,215,96,0.08)" }}
                formatter={(value, _name, item) => {
                  const trackCount =
                    item &&
                    typeof item === "object" &&
                    "payload" in item &&
                    item.payload &&
                    typeof item.payload === "object" &&
                    "tracks" in item.payload
                      ? Number(item.payload.tracks)
                      : null;
                  return [
                    typeof value === "number"
                      ? `${value.toLocaleString()} plays${
                          trackCount !== null
                            ? ` · ${trackCount} tracks`
                            : ""
                        }`
                      : value,
                    "Listening",
                  ];
                }}
              />
              <Bar dataKey="plays" radius={[0, 8, 8, 0]}>
                {artists.map((row) => (
                  <Cell fill={CHART_GREEN} key={row.artist} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard
        actions={
          <SegmentedToggle
            options={TIME_RANGES}
            value={timeRange}
            onChange={setTimeRange}
          />
        }
        description={timeDescription}
        title="Plays over time"
      >
        {playsOverTime.length === 0 ? (
          <p className="py-16 text-center text-sm text-[#a7b0aa]">
            No plays logged yet for this range.
          </p>
        ) : (
          <ResponsiveContainer height={320} width="100%">
            <AreaChart data={playsOverTime}>
              <defs>
                <linearGradient id="playsFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={CHART_GREEN} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={CHART_GREEN} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART_GRID} vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK_SMALL}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <YAxis
                allowDecimals={false}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                formatter={(value) => [
                  typeof value === "number" ? value.toLocaleString() : value,
                  "Plays",
                ]}
              />
              <Area
                type="monotone"
                dataKey="plays"
                stroke={CHART_GREEN}
                fill="url(#playsFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard
        description="0–100 score from play coverage, freshness (last 90 days), balance, volume, and availability."
        title="Playlist health score"
      >
        {playlistHealth.length === 0 ? (
          <p className="py-16 text-center text-sm text-[#a7b0aa]">
            No preferred playlists to score.
          </p>
        ) : (
          <ResponsiveContainer height={playlistChartHeight} width="100%">
            <BarChart
              data={playlistHealth}
              layout="vertical"
              margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
            >
              <CartesianGrid stroke={CHART_GRID} horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="playlist"
                width={128}
                interval={0}
                tick={AXIS_TICK_SMALL}
                tickFormatter={(value) => truncateLabel(String(value))}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                cursor={{ fill: "rgba(30,215,96,0.08)" }}
                formatter={(value, _name, item) => {
                  const row =
                    item &&
                    typeof item === "object" &&
                    "payload" in item &&
                    item.payload &&
                    typeof item.payload === "object"
                      ? (item.payload as {
                          avgPlays?: number;
                          neverPlayedPct?: number;
                          stalePct?: number;
                          concentration?: number;
                        })
                      : null;
                  const detail = row
                    ? ` · avg ${row.avgPlays ?? 0} · ${row.neverPlayedPct ?? 0}% never · ${row.stalePct ?? 0}% stale · ${row.concentration ?? 0}% top-heavy`
                    : "";
                  return [
                    typeof value === "number"
                      ? `${value}/100${detail}`
                      : value,
                    "Health",
                  ];
                }}
              />
              <Bar dataKey="healthScore" radius={[0, 8, 8, 0]}>
                {playlistHealth.map((row) => (
                  <Cell
                    fill={healthFill(row.healthScore)}
                    key={row.playlistId}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          description="Share of tracks in each playlist that have never logged a play."
          title="Never-played tracks"
        >
          <ResponsiveContainer height={playlistChartHeight} width="100%">
            <BarChart
              data={playlistHealth}
              layout="vertical"
              margin={{ left: 8, right: 12, top: 4, bottom: 4 }}
            >
              <CartesianGrid stroke={CHART_GRID} horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                unit="%"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="playlist"
                width={118}
                interval={0}
                tick={AXIS_TICK_SMALL}
                tickFormatter={(value) => truncateLabel(String(value), 16)}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                cursor={{ fill: "rgba(226,85,85,0.08)" }}
                formatter={(value, _name, item) => {
                  const count =
                    item &&
                    typeof item === "object" &&
                    "payload" in item &&
                    item.payload &&
                    typeof item.payload === "object" &&
                    "neverPlayed" in item.payload
                      ? Number(item.payload.neverPlayed)
                      : null;
                  return [
                    typeof value === "number"
                      ? `${value}%${count !== null ? ` · ${count} tracks` : ""}`
                      : value,
                    "Never played",
                  ];
                }}
              />
              <Bar dataKey="neverPlayedPct" fill={CHART_RED} radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          description="Tracks with no plays in the last 90 days (includes never played)."
          title="Stale tracks"
        >
          <ResponsiveContainer height={playlistChartHeight} width="100%">
            <BarChart
              data={playlistHealth}
              layout="vertical"
              margin={{ left: 8, right: 12, top: 4, bottom: 4 }}
            >
              <CartesianGrid stroke={CHART_GRID} horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                unit="%"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="playlist"
                width={118}
                interval={0}
                tick={AXIS_TICK_SMALL}
                tickFormatter={(value) => truncateLabel(String(value), 16)}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                cursor={{ fill: "rgba(230,180,34,0.08)" }}
                formatter={(value, _name, item) => {
                  const count =
                    item &&
                    typeof item === "object" &&
                    "payload" in item &&
                    item.payload &&
                    typeof item.payload === "object" &&
                    "stale" in item.payload
                      ? Number(item.payload.stale)
                      : null;
                  return [
                    typeof value === "number"
                      ? `${value}%${count !== null ? ` · ${count} tracks` : ""}`
                      : value,
                    "Stale",
                  ];
                }}
              />
              <Bar dataKey="stalePct" fill={CHART_AMBER} radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          description="Playlist size (bars) against lifetime play volume (line)."
          title="Size vs plays"
        >
          <ResponsiveContainer
            height={Math.max(280, playlistHealth.length * 18)}
            width="100%"
          >
            <ComposedChart
              data={playlistHealth}
              margin={{ left: 4, right: 8, top: 8, bottom: 48 }}
            >
              <CartesianGrid stroke={CHART_GRID} vertical={false} />
              <XAxis
                dataKey="playlist"
                interval={0}
                angle={-32}
                textAnchor="end"
                height={70}
                tick={AXIS_TICK_SMALL}
                tickFormatter={(value) => truncateLabel(String(value), 12)}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="left"
                allowDecimals={false}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                allowDecimals={false}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
              />
              <Legend wrapperStyle={{ color: CHART_TICK }} />
              <Bar
                yAxisId="left"
                dataKey="trackCount"
                name="Tracks"
                fill={CHART_BLUE}
                radius={[6, 6, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="totalPlays"
                name="Plays"
                stroke={CHART_GREEN}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART_GREEN }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          description="How much of each playlist’s plays come from the top 20% of its tracks. Lower is healthier."
          title="Play concentration"
        >
          <ResponsiveContainer height={playlistChartHeight} width="100%">
            <BarChart
              data={playlistHealth}
              layout="vertical"
              margin={{ left: 8, right: 12, top: 4, bottom: 4 }}
            >
              <CartesianGrid stroke={CHART_GRID} horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                unit="%"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="playlist"
                width={118}
                interval={0}
                tick={AXIS_TICK_SMALL}
                tickFormatter={(value) => truncateLabel(String(value), 16)}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                cursor={{ fill: "rgba(91,159,212,0.08)" }}
                formatter={(value) => [
                  typeof value === "number" ? `${value}% from top 20%` : value,
                  "Concentration",
                ]}
              />
              <Bar
                dataKey="concentration"
                fill={CHART_BLUE}
                radius={[0, 8, 8, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard
        description="Full per-playlist breakdown used for the health score."
        title="Playlist health details"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.14em] text-[#69736d]">
              <tr className="border-b border-white/10">
                <th className="px-2 py-3 font-medium">Playlist</th>
                <th className="px-2 py-3 font-medium">Score</th>
                <th className="px-2 py-3 font-medium">Tracks</th>
                <th className="px-2 py-3 font-medium">Plays</th>
                <th className="px-2 py-3 font-medium">Avg</th>
                <th className="px-2 py-3 font-medium">Never</th>
                <th className="px-2 py-3 font-medium">Stale</th>
                <th className="px-2 py-3 font-medium">Top-heavy</th>
                <th className="px-2 py-3 font-medium">Dead</th>
              </tr>
            </thead>
            <tbody>
              {playlistHealth.map((row) => (
                <tr
                  className="border-b border-white/5 text-[#d7ddd9]"
                  key={row.playlistId}
                >
                  <td className="max-w-[14rem] truncate px-2 py-3 text-white">
                    {row.playlist}
                  </td>
                  <td className="px-2 py-3 font-semibold text-white">
                    {row.healthScore}
                  </td>
                  <td className="px-2 py-3">{row.trackCount.toLocaleString()}</td>
                  <td className="px-2 py-3">{row.totalPlays.toLocaleString()}</td>
                  <td className="px-2 py-3">{row.avgPlays}</td>
                  <td className="px-2 py-3">
                    {row.neverPlayed} ({row.neverPlayedPct}%)
                  </td>
                  <td className="px-2 py-3">
                    {row.stale} ({row.stalePct}%)
                  </td>
                  <td className="px-2 py-3">{row.concentration}%</td>
                  <td className="px-2 py-3">{row.unplayable}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}

function RankToggle({
  value,
  onChange,
}: {
  value: RankMode;
  onChange: (value: RankMode) => void;
}) {
  return (
    <SegmentedToggle options={RANK_MODES} value={value} onChange={onChange} />
  );
}

function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-full border border-white/10 bg-black/20 p-1">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? "bg-[#1ed760] text-[#07150c]"
                : "text-[#a7b0aa] hover:bg-white/5 hover:text-white"
            }`}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#69736d]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
        {value}
      </p>
    </div>
  );
}

function ChartCard({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-[#a7b0aa]">{description}</p>
        </div>
        {actions}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
