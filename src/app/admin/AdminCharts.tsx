"use client";

import { useEffect, useRef, useState } from "react";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const short = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Visits per day: soft area + line, hover shows the day. */
export function AreaChart({ points, height = 220 }: { points: { day: string; visits: number }[]; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 34;
  const padB = 26;
  const padT = 12;
  const max = Math.max(4, ...points.map((p) => p.visits));
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step;
  const x = (i: number) => padL + (i * (w - padL - 8)) / Math.max(1, points.length - 1);
  const y = (v: number) => padT + (1 - v / top) * (height - padT - padB);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.visits).toFixed(1)}`).join("");
  const area = points.length ? `${line}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z` : "";
  const ticks = [0, top / 2, top];
  const every = Math.ceil(points.length / 6);
  return (
    <div ref={ref} className="axa-chart" onMouseLeave={() => setHover(null)}>
      <svg width={w} height={height} role="img" aria-label="Visits per day">
        <defs>
          <linearGradient id="axa-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2458ff" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#2458ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - 8} y1={y(t)} y2={y(t)} stroke="#e3e9f5" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="axa-chart-tick">{Math.round(t)}</text>
          </g>
        ))}
        {points.map((p, i) =>
          i % every === 0 ? (
            <text key={p.day} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i > points.length - every ? "end" : "middle"} className="axa-chart-tick">{short(p.day)}</text>
          ) : null,
        )}
        <path d={area} fill="url(#axa-area)" />
        <path d={line} fill="none" stroke="#2458ff" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && points[hover] && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={y(0)} stroke="#9fb4ff" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(points[hover].visits)} r="5" fill="#fff" stroke="#2458ff" strokeWidth="2.5" />
          </g>
        )}
        {points.map((p, i) => (
          <rect
            key={p.day}
            x={x(i) - (w - padL) / points.length / 2}
            y={0}
            width={(w - padL) / points.length}
            height={height}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>
      {hover !== null && points[hover] && (
        <div className="axa-chart-tip" style={{ left: Math.min(w - 120, Math.max(0, x(hover) - 60)) }}>
          <b>{points[hover].visits}</b> visits · {short(points[hover].day)}
        </div>
      )}
    </div>
  );
}

/** Horizontal bars with a label and a value. */
export function BarList({ rows, color = "#2458ff" }: { rows: { key: string; label: string; value: number; text?: string }[]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="axa-empty small">No data yet.</p>;
  return (
    <ul className="axa-bars">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="axa-bars-label">{r.label}</span>
          <span className="axa-bars-track">
            <i style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </span>
          <b>{r.text ?? r.value}</b>
        </li>
      ))}
    </ul>
  );
}
