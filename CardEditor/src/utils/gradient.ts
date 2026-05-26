// Deterministic gradient/stripe pattern from card _id. Mirrors §9.
export function gradientFor(id: string) {
  const hash = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue1 = (hash * 37) % 360;
  const hue2 = (hue1 + 35) % 360;
  const gradAngle = (hash * 11) % 180;
  const stripeAngle = (hash * 17) % 180;
  const bg = `linear-gradient(${gradAngle}deg, oklch(28% 0.06 ${hue1}) 0%, oklch(20% 0.08 ${hue2}) 100%)`;
  const stripe = `repeating-linear-gradient(${stripeAngle}deg, rgba(255,255,255,.04) 0 2px, transparent 2px 11px)`;
  return { background: `${stripe}, ${bg}` };
}
