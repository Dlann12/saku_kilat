"use client";

import React, { useState } from "react";
import { formatRupiah } from "./Formatters";

interface DailyPoint {
  label: string;
  dateIso: string;
  outAmount: number;
  inAmount: number;
}

interface CategoryShare {
  category: string;
  amount: number;
  sharePercent: number;
}

function niceRoundMax(val: number): number {
  if (val <= 0) return 100_000;
  const mag = Math.pow(10, Math.floor(Math.log10(val)));
  const norm = val / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

export function SpendingBarChart({
  data,
  mode = "OUT",
}: {
  data: DailyPoint[];
  mode?: "OUT" | "IN";
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const values = data.map((d) => (mode === "OUT" ? d.outAmount : d.inAmount));
  const rawMax = Math.max(0, ...values);
  const maxVal = niceRoundMax(rawMax * 1.15);
  const ticks = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal];

  const width = 560;
  const height = 210;
  const padL = 78;
  const padR = 12;
  const padT = 14;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const colW = data.length > 0 ? plotW / data.length : plotW;
  const barW = Math.min(34, colW * 0.54);

  const barColor = mode === "OUT" ? "var(--chart-1)" : "var(--positive)";

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto block num"
        role="img"
        aria-label={
          mode === "OUT"
            ? "Grafik pengeluaran harian 7 hari terakhir"
            : "Grafik pemasukan harian 7 hari terakhir"
        }
      >
        {ticks.map((t, i) => {
          const y = padT + plotH - (t / maxVal) * plotH;
          return (
            <g key={i}>
              <line
                x1={padL}
                x2={width - padR}
                y1={y}
                y2={y}
                stroke={i === 0 ? "var(--control)" : "var(--grid)"}
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text
                x={padL - 10}
                y={y + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--axis-ink)"
              >
                {t === 0
                  ? "Rp 0"
                  : t >= 1_000_000
                  ? `Rp ${(t / 1_000_000).toFixed(1)} jt`
                  : `Rp ${Math.round(t / 1000)} rb`}
              </text>
            </g>
          );
        })}

        {data.map((d, idx) => {
          const v = mode === "OUT" ? d.outAmount : d.inAmount;
          const barH = maxVal > 0 ? (v / maxVal) * plotH : 0;
          const x = padL + idx * colW + (colW - barW) / 2;
          const y = padT + plotH - barH;
          const isLast = idx === data.length - 1;
          const isHover = hoveredIdx === idx;
          return (
            <g
              key={d.dateIso}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: "pointer" }}
            >
              <rect
                x={padL + idx * colW}
                y={padT}
                width={colW}
                height={plotH}
                fill="transparent"
              />
              {v > 0 && (
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(2, barH)}
                  rx={3}
                  fill={barColor}
                  fillOpacity={isHover ? 1 : isLast ? 0.95 : 0.72}
                />
              )}
              <text
                x={padL + idx * colW + colW / 2}
                y={height - 6}
                textAnchor="middle"
                fontSize={11}
                fill={isHover ? "var(--text)" : "var(--axis-ink)"}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>

      {hoveredIdx !== null && data[hoveredIdx] && (
        <div
          className="absolute top-1 right-2 px-2.5 py-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-xs num pointer-events-none"
          style={{ boxShadow: "0 4px 12px rgba(27,29,31,0.06)" }}
        >
          <span className="text-[var(--muted)]">{data[hoveredIdx].label}: </span>
          <span className="font-semibold text-[var(--text)]">
            {formatRupiah(
              mode === "OUT" ? data[hoveredIdx].outAmount : data[hoveredIdx].inAmount
            )}
          </span>
        </div>
      )}
    </div>
  );
}

export function CategoryBreakdownList({
  categories,
  totalOut,
}: {
  categories: CategoryShare[];
  totalOut: number;
}) {
  if (categories.length === 0) {
    return (
      <div className="border border-dashed border-[var(--control)] rounded-[10px] p-5 text-sm text-[var(--muted)] text-center">
        Belum ada transaksi keluar pada periode ini.
      </div>
    );
  }

  const maxAmount = Math.max(...categories.map((c) => c.amount), 1);

  return (
    <div className="space-y-3.5">
      {categories.slice(0, 6).map((cat, idx) => {
        const widthPct = Math.round((cat.amount / maxAmount) * 100);
        return (
          <div key={cat.category} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-[var(--text)] truncate">{cat.category}</span>
              <span className="num text-[var(--text)] whitespace-nowrap">
                <span className="font-semibold">{formatRupiah(cat.amount)}</span>
                <span className="text-[var(--faint)] ml-2 text-xs">
                  {cat.sharePercent.toFixed(1)}%
                </span>
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-[var(--rule)] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(4, widthPct)}%`,
                  background: idx === 0 ? "var(--accent)" : "var(--text)",
                  opacity: idx === 0 ? 1 : 0.72 - idx * 0.08,
                }}
              />
            </div>
          </div>
        );
      })}
      <div className="pt-2 border-t border-[var(--rule)] flex justify-between text-xs text-[var(--muted)] num">
        <span>Total Pengeluaran Terhitung</span>
        <span className="font-semibold text-[var(--text)]">{formatRupiah(totalOut)}</span>
      </div>
    </div>
  );
}

