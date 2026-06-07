/**
 * Deterministic gradient + diagonal-stripe "art" derived from the card slug.
 * No real artwork yet — this gives every card a stable, slug-keyed visual
 * identity without the page feeling empty. Replace with real `card.image_url`
 * fallback handling once art exists.
 *
 * The two corner labels mirror the file-folder feel of the design:
 *   - top-left: category (e.g. POLITIK, MEDIEN)
 *   - top-right: deck_name (e.g. AUFSTIEG I, TUTORIAL)
 * Both fall back to placeholder labels when missing so cards still look
 * complete during authoring.
 */
import styles from './CardArt.module.css';

interface Props {
  slug: string;
  category?: string;
  deckName?: string | null;
  /** Real artwork. When set, it's laid over the gradient and feathered into it
   *  on every edge; the gradient still provides the colour + corner labels. */
  imageUrl?: string | null;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) | 0;
  return h;
}

export default function CardArt({ slug, category, deckName, imageUrl }: Props) {
  const h = hashCode(slug);
  const hue1 = (h * 37) % 360;
  const hue2 = (hue1 + 35) % 360;
  const gradAngle = (h * 11) % 180;
  const stripeAngle = (h * 17) % 180;

  const bg = `linear-gradient(${gradAngle}deg, oklch(28% 0.06 ${hue1}) 0%, oklch(20% 0.08 ${hue2}) 100%)`;
  const stripe = `repeating-linear-gradient(${stripeAngle}deg, rgba(255,255,255,.04) 0 2px, transparent 2px 11px)`;

  const leftLabel = (category ?? 'AKTE').toUpperCase();
  const rightLabel = (deckName ?? `FILE ${slug.slice(-4)}`).toUpperCase();

  return (
    <div className={styles.art} style={{ background: bg }}>
      <div className={styles.stripes} style={{ background: stripe }} aria-hidden />
      {imageUrl && (
        <div className={styles.photo} style={{ backgroundImage: `url(${imageUrl})` }} aria-hidden />
      )}
      <div className={styles.corner}>
        <span className={styles.category}>{leftLabel}</span>
        <span className={styles.deckChip}>{rightLabel}</span>
      </div>
    </div>
  );
}
