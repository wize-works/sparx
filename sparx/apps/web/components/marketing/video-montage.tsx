'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The full-bleed "whoever you are" background montage.
 *
 * Fills the entire section (absolute inset) and plays a playlist of short,
 * ship-safe clips (Pexels License + Mixkit Free License — both commercial-use,
 * no attribution) back to back, each a different KIND of business, so it reads
 * as "transitions between client types" without a video editor. A flat charcoal
 * overlay (NOT a gradient — banned brand-wide) sits over the footage so the
 * section's headline + CTAs stay legible; the type labels run as a ticker along
 * the bottom, the active one lit white. Adding a vertical is a one-line edit to
 * CLIPS + a file in public/video.
 *
 * Performance + a11y: lazy (only loads once it scrolls near view), and
 * poster-only on mobile and under prefers-reduced-motion (saves data/battery and
 * respects the setting). Clips are muted + playsInline so autoplay is allowed.
 */
const CLIPS = [
  { src: '/video/whoever-seller.mp4', label: 'Seller' },
  { src: '/video/whoever-maker.mp4', label: 'Maker' },
  { src: '/video/whoever-tailor.mp4', label: 'Tailor' },
  { src: '/video/whoever-salon.mp4', label: 'Salon' },
  { src: '/video/whoever-studio.mp4', label: 'Studio' },
  { src: '/video/whoever-workshop.mp4', label: 'Workshop' },
  { src: '/video/whoever-dropship.mp4', label: 'Dropship' },
  { src: '/video/whoever-retail.mp4', label: 'Retailer' },
] as const;
const POSTER = '/video/whoever-poster.jpg';

export function VideoMontage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const narrow = window.matchMedia('(max-width: 768px)').matches;
    if (reduced || narrow) return;
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setActive(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: '250px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    const clip = CLIPS[index];
    if (!v || !active || !clip) return;
    v.src = clip.src;
    v.load();
    v.play().catch(() => undefined);
  }, [active, index]);

  const current = active ? index : 0;

  return (
    <div ref={wrapRef} className="mkt-video-bg" aria-hidden>
      {active ? (
        <video
          ref={videoRef}
          className={['mkt-video-el', fading ? 'mkt-video-el--fading' : '']
            .filter(Boolean)
            .join(' ')}
          poster={POSTER}
          muted
          playsInline
          autoPlay
          preload="auto"
          onPlaying={() => setFading(false)}
          onEnded={() => {
            setFading(true);
            setIndex((n) => (n + 1) % CLIPS.length);
          }}
        />
      ) : (
        <img src={POSTER} alt="" className="mkt-video-el" />
      )}

      {/* Flat charcoal scrim — solid tint, not a gradient — so white headline +
          CTAs read over any clip (the bright studio/salon shots included). */}
      <div className="mkt-video-overlay" />

      <div className="mkt-video-tags">
        <div className="mkt-video-tags-inner">
          {CLIPS.map((c, i) => (
            <span key={c.label} className={`mkt-video-tag ${i === current ? '' : ''}`}>
              {c.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
