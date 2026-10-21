import { colors } from '@vigil/design-system';
import type { TrendResponse } from '@vigil/shared-types';
import { useEffect, useMemo, useRef } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/**
 * Trend of check-ins against the person's OWN usual range (μ ± σ). The axis
 * reads "Heavier ↔ Lighter" — no numeric scores, even for staff. Colours are
 * imported from the design-system tokens (not CSS vars) so the chart stays
 * correct through a repaint/PDF-export path, which can't resolve var().
 * Only genuinely new points animate in (400ms); re-renders never replay.
 */
export function TrendChart({ trend }: { trend: TrendResponse }) {
  const prevCount = useRef(0);
  const data = useMemo(
    () =>
      trend.points.map((p) => ({
        at: p.at,
        value: p.compositeScore,
        band: trend.baseline?.sufficient ? [trend.baseline.mean - trend.baseline.stddev, trend.baseline.mean + trend.baseline.stddev] : undefined,
      })),
    [trend],
  );
  const animate = data.length > prevCount.current;
  // Record what has been shown only after commit, so StrictMode's double
  // render can't swallow the animation for genuinely new points.
  useEffect(() => {
    prevCount.current = data.length;
  }, [data.length]);

  if (!data.length) return <p className="text-sm text-ink-muted">No check-ins yet.</p>;

  const baseline = trend.baseline;
  const describe = (v: number) => {
    if (!baseline?.sufficient) return 'Still learning what is usual for them';
    if (v < baseline.mean - baseline.stddev) return 'Heavier than usual for them';
    if (v > baseline.mean + baseline.stddev) return 'Lighter than usual for them';
    return 'Within their usual range';
  };

  return (
    <figure>
      <div className="h-56 w-full" role="img" aria-label={`Trend of ${data.length} check-ins. Latest: ${describe(data[data.length - 1]!.value)}.`}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={colors.border} vertical={false} />
            <XAxis dataKey="at" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={(t: number) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} tick={{ fontSize: 12, fill: colors.inkMuted }} />
            <YAxis domain={[-1, 1]} ticks={[-1, 0, 1]} tickFormatter={(v: number) => (v === -1 ? 'Heavier' : v === 1 ? 'Lighter' : '')} width={64} tick={{ fontSize: 12, fill: colors.inkMuted }} />
            <Area dataKey="band" stroke="none" fill={colors.ice} fillOpacity={0.6} isAnimationActive={false} name="Their usual range" />
            {baseline?.sufficient && <ReferenceLine y={baseline.mean} stroke={colors.primary} strokeDasharray="4 4" />}
            <Line dataKey="value" stroke={colors.primary} strokeWidth={2.5} dot={{ r: 3.5, fill: colors.primary }} isAnimationActive={animate} animationDuration={400} name="Check-in" />
            <Tooltip
              labelFormatter={(t) => new Date(Number(t)).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              formatter={(v, name) => (name === 'Check-in' ? [describe(Number(v)), 'How it compares'] : [null, null])}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 flex items-center gap-4 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-navy-700" aria-hidden /> Their check-ins</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm bg-ice-300" aria-hidden /> Their usual range</span>
      </figcaption>
    </figure>
  );
}
