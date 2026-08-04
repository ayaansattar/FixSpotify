"use client";

import type { ReactNode } from "react";
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

import type { InsightsData } from "@/lib/insights";

const CHART_GREEN = "#1ed760";
const CHART_MUTED = "#69736d";
const CHART_GRID = "rgba(255,255,255,0.08)";
const TOOLTIP_STYLE = {
  backgroundColor: "#111713",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  color: "#f4f7f5",
};

type InsightsChartsProps = {
  data: InsightsData;
};

export function InsightsCharts({ data }: InsightsChartsProps) {
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
          description="How many songs sit at each play-count level across your preferred playlists."
          title="Songs by play count"
        >
          <ResponsiveContainer height={300} width="100%">
            <BarChart data={data.playCountDistribution}>
              <CartesianGrid stroke={CHART_GRID} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: CHART_MUTED, fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: CHART_MUTED, fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ fill: "rgba(30,215,96,0.08)" }}
                formatter={(value) => [
                  typeof value === "number" ? value.toLocaleString() : value,
                  "Songs",
                ]}
                labelFormatter={(label) => `${label} plays`}
              />
              <Bar dataKey="songs" fill={CHART_GREEN} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          description="Lifetime plays for artists that appear in your preferred playlists (top 15)."
          title="Top artists by plays"
        >
          <ResponsiveContainer height={300} width="100%">
            <BarChart
              data={data.topArtists}
              layout="vertical"
              margin={{ left: 8, right: 12 }}
            >
              <CartesianGrid stroke={CHART_GRID} horizontal={false} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fill: CHART_MUTED, fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="artist"
                width={110}
                tick={{ fill: CHART_MUTED, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ fill: "rgba(30,215,96,0.08)" }}
                formatter={(value, _name, item) => {
                  const tracks =
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
                          tracks !== null ? ` · ${tracks} tracks` : ""
                        }`
                      : value,
                    "Listening",
                  ];
                }}
              />
              <Bar dataKey="plays" radius={[0, 8, 8, 0]}>
                {data.topArtists.map((row) => (
                  <Cell fill={CHART_GREEN} key={row.artist} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          description="Monthly listening volume from imported history and ongoing sync (last ~18 months)."
          title="Plays over time"
        >
          <ResponsiveContainer height={300} width="100%">
            <AreaChart data={data.playsByMonth}>
              <defs>
                <linearGradient id="playsFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={CHART_GREEN} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={CHART_GREEN} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART_GRID} vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: CHART_MUTED, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: CHART_MUTED, fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
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
        </ChartCard>

        <ChartCard
          description="Unique track counts in each preferred playlist."
          title="Playlist sizes"
        >
          <ResponsiveContainer height={300} width="100%">
            <BarChart data={data.playlistSizes}>
              <CartesianGrid stroke={CHART_GRID} vertical={false} />
              <XAxis
                dataKey="playlist"
                tick={{ fill: CHART_MUTED, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={70}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: CHART_MUTED, fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ fill: "rgba(30,215,96,0.08)" }}
                formatter={(value) => [
                  typeof value === "number" ? value.toLocaleString() : value,
                  "Tracks",
                ]}
              />
              <Bar dataKey="tracks" fill="#4ade80" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
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
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-[#a7b0aa]">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}
