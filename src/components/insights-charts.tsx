"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
