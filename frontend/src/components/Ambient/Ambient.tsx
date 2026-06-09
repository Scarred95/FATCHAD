import styles from './Ambient.module.css';

/**
 * Drifting aurora backdrop shared across every non-gameplay screen.
 *
 * Fixed to the viewport and painted behind page content (z-index: -1), so it
 * never intercepts pointer events or tints the UI. Render it as a direct child
 * of the page root — placing it inside a transformed ancestor (e.g. a
 * framer-motion div) would trap the fixed positioning and break the layout.
 */
export default function Ambient() {
  return <div className={styles.ambient} aria-hidden />;
}
