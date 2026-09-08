'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import { cx } from './cx';
import { MASCOT_BODY_PATH, MASCOT_FACE, MASCOT_STROKE_WIDTH, MASCOT_VIEWBOX } from '../marks';

/**
 * SparkMascot — "sparky", the sparx brand character.
 *
 * The body is the OUTLINED (hollow) spark, stroked in the brand color; the page
 * shows through its open centre. The face (eyes + mouth) is a SEPARATE layer so
 * it can blink and change expression — a gentle idle bob + blink, plus an
 * optional `cycle` for hero moments. Geometry (body + rest-pose face anchors)
 * lives in ../marks; the expressions below are tuned around that same centre.
 *
 * Two-tone by design: an orange spark with a deep-navy face. On light surfaces
 * use `tone="light"` (the default); on dark surfaces use `tone="dark"` so the
 * face flips to white and stays legible over the open centre. Motion lives in
 * the consumer's CSS (`.spark-mascot*`, in sparx/apps/web/app/marketing.css) and
 * honours prefers-reduced-motion.
 */

// Rest-pose anchors from the delivered artwork (../marks). The face is drawn in
// the mascot's native viewBox coordinates so it lines up with the hollow centre.
const EYES = {
  lx: MASCOT_FACE.eyeLx,
  rx: MASCOT_FACE.eyeRx,
  cy: MASCOT_FACE.eyeCy,
  rxv: MASCOT_FACE.eyeRx_,
  ryv: MASCOT_FACE.eyeRy,
} as const;

export type SparkExpression =
  'neutral' | 'happy' | 'wink' | 'excited' | 'content' | 'surprised' | 'sad' | 'asleep';

// sparky's canonical smile, lifted verbatim from sparky.svg — a FILLED navy
// crescent under the eyes. Every "happy" beat reuses it so the rest pose matches
// the delivered artwork exactly.
const SMILE = 'M207.91,195.97c.92,23.16-36.21,23.15-35.28,0,0,6.14,35.28,6.14,35.28,0Z';

// Each face = the two eyes' vertical scale (1 = open, ~0.1 ≈ closed) + a mouth
// path anchored under the eyes at the lobe centre (x ≈ 189.5, y ≈ 196). `fill`
// mouths are closed shapes (the smile crescent, an open "o"); otherwise the mouth
// is a stroked line at `stroke` px. Sizes are in the mascot's 380-unit viewBox,
// so mouths read at favicon scale, not just hero scale.
const FACES: Record<
  SparkExpression,
  { mouth: string; lY: number; rY: number; fill: boolean; stroke?: number; wink?: boolean }
> = {
  // Exactly the delivered sparky: open eyes + the filled smile.
  happy: { mouth: SMILE, lY: 1, rY: 1, fill: true },
  // A calmer, shallower smile — same crescent, eyes a touch relaxed.
  neutral: {
    mouth: 'M203,196c.6,15-24,15-23.5,0,0,4,23.5,4,23.5,0Z',
    lY: 0.9,
    rY: 0.9,
    fill: true,
  },
  content: { mouth: 'M201,197c.5,11-18.5,11-18,0,0,3,18,3,18,0Z', lY: 0.55, rY: 0.55, fill: true },
  // The left eye WINKS (animates closed↔open via CSS); the right stays open. A
  // static closed eye reads as a defect, so this is a live gesture, not a held pose.
  wink: { mouth: SMILE, lY: 1, rY: 1, fill: true, wink: true },
  excited: { mouth: 'M179,204 a10.5,10.5 0 0 0 21,0 z', lY: 1.2, rY: 1.2, fill: true },
  surprised: {
    mouth: 'M183,205 a6.5,6.5 0 1 0 13,0 a6.5,6.5 0 1 0 -13,0 z',
    lY: 1.3,
    rY: 1.3,
    fill: true,
  },
  // Upturned frown (stroked) — eyes slightly drooped.
  sad: { mouth: 'M177,204 q12.5,-11 25,0', lY: 0.9, rY: 0.9, fill: false, stroke: 7 },
  asleep: { mouth: 'M181,199 q8.5,5 17,0', lY: 0.1, rY: 0.1, fill: false, stroke: 6 },
};

const TONES = {
  // Orange spark on both; the face flips so it stays legible over the open
  // centre — deep navy on a light page, white on a dark one.
  light: { body: 'var(--color-primary, #e04631)', face: 'var(--color-secondary, #0c1433)' },
  dark: { body: 'var(--color-primary, #e04631)', face: '#ffffff' },
} as const;

export interface SparkMascotProps {
  expression?: SparkExpression;
  /** Auto-rotate through these expressions (hero use). Pauses under reduced motion. */
  cycle?: SparkExpression[];
  intervalMs?: number;
  size?: number;
  tone?: keyof typeof TONES;
  /** Whole-body float. Off in the hero so it doesn't pull focus from a rotating
   *  headline; the face stays alive on its own. */
  bob?: boolean;
  /** Eye blink — keeps the face living even when the body is still. */
  blink?: boolean;
  title?: string;
  className?: string;
}

export function SparkMascot({
  expression = 'happy',
  cycle,
  intervalMs = 2400,
  size = 168,
  tone = 'light',
  bob = true,
  blink = true,
  title = 'sparky',
  className,
}: SparkMascotProps) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!cycle || cycle.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setStep((n) => n + 1), intervalMs);
    return () => clearInterval(timer);
  }, [cycle, intervalMs]);

  const active: SparkExpression = cycle?.length
    ? (cycle[step % cycle.length] ?? expression)
    : expression;
  const face = FACES[active];
  const palette = TONES[tone];

  return (
    <span
      className={cx('spark-mascot', bob && 'spark-mascot--bob', className)}
      style={{ width: size }}
    >
      <svg
        viewBox={MASCOT_VIEWBOX}
        width={size}
        role="img"
        aria-label={title}
        style={{ width: '100%', height: 'auto', overflow: 'visible' }}
      >
        {/* Body drawn EXACTLY as the delivered sparky.svg — sharp miter points
            (stroke-miterlimit:10), not rounded joins. It's the wordmark's "x"
            mutated into a spark, so the sharp tips are the whole point. */}
        <path
          d={MASCOT_BODY_PATH}
          fill="none"
          stroke={palette.body}
          strokeWidth={MASCOT_STROKE_WIDTH}
          strokeLinejoin="miter"
          strokeMiterlimit={10}
        />
        {/* Face layer. The eyes scale around their OWN centre (transform-box:
            fill-box in CSS) so blink + expression changes happen in place. */}
        <g>
          <g className={cx('spark-mascot__eyes', blink && 'spark-mascot__eyes--blink')}>
            <ellipse
              className={cx('spark-mascot__eye', face.wink && 'spark-mascot__eye--wink')}
              cx={EYES.lx}
              cy={EYES.cy}
              rx={EYES.rxv}
              ry={EYES.ryv}
              fill={palette.face}
              // When winking, the CSS animation drives the transform; otherwise
              // the expression's static scaleY applies.
              style={face.wink ? undefined : { transform: `scaleY(${face.lY})` }}
            />
            <ellipse
              className="spark-mascot__eye"
              cx={EYES.rx}
              cy={EYES.cy}
              rx={EYES.rxv}
              ry={EYES.ryv}
              fill={palette.face}
              style={{ transform: `scaleY(${face.rY})` }}
            />
          </g>
          <path
            className="spark-mascot__mouth"
            d={face.mouth}
            fill={face.fill ? palette.face : 'none'}
            stroke={face.fill ? 'none' : palette.face}
            strokeWidth={face.stroke ?? 0}
            strokeLinecap="round"
          />
        </g>
      </svg>
    </span>
  );
}
