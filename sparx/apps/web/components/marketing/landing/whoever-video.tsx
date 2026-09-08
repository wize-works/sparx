'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The full-bleed "whoever you are" background montage. The chrome (scrim,
 * ticker, fade) is Tailwind utilities rather than the `mkt-video-*` classes in
 * marketing.css; the lazy/poster/reduced-motion playback below is genuine
 * behavior, not styling, so it lives here rather than in a class.
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

export function WhoeverVideo() {
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
    <div
      ref={wrapRef}
      className="absolute inset-0 z-0 overflow-hidden rounded-[inherit]"
      aria-hidden
    >
      {active ? (
        <video
          ref={videoRef}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 motion-reduce:transition-none ${fading ? 'opacity-10' : 'opacity-100'}`}
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
        <img src={POSTER} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}

      {/* Flat scrim — solid tint, not a gradient — so white headline + CTAs
          read over any clip (the bright studio/salon shots included). */}
      <div className="absolute inset-0 bg-black/60" />

      <div className="absolute inset-x-0 bottom-0 bg-black/50 px-6 py-4 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-x-6 gap-y-2 text-xs">
          {/* The playing clip is marked by COLOR AND WEIGHT, not by fading the
              others out. Both branches of this used to be `text-base-content`,
              so the active label was never marked at all. */}
          {CLIPS.map((c, i) => (
            <span
              key={c.label}
              className={`transition-colors duration-300 ${
                i === current ? 'text-primary font-semibold' : ''
              }`}
            >
              {c.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
