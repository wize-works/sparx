// Star rating display. Renders a 5-star glyph row with a partial fill driven
// by a CSS variable (--pct) so half-stars render precisely. Pure presentation.

export interface RatingStarsProps {
  rating: number; // 0–5
  count?: number;
  compact?: boolean;
}

export function RatingStars({ rating, count, compact }: RatingStarsProps) {
  const pct = `${Math.max(0, Math.min(5, rating)) * 20}%`;
  return (
    <span className="sf-rating" aria-label={`Rated ${rating.toFixed(1)} out of 5`}>
      <span className="sf-rating__stars" style={{ ['--pct' as string]: pct }} aria-hidden="true">
        ★★★★★
      </span>
      {!compact && count != null ? (
        <span>
          {rating.toFixed(1)} ({count})
        </span>
      ) : null}
      {compact && count != null ? <span>({count})</span> : null}
    </span>
  );
}
