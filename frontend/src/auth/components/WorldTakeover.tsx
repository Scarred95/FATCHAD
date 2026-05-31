import { Fragment } from 'react';
import styles from '../auth.module.css';

interface WorldTakeoverProps {
  /** Player handle, rendered as @name in the accent colour. */
  name: string;
  /** Override the default two-line German greeting. */
  lines?: string[];
}

/**
 * The slanted "let's take over the world" greeting sticker. Drop it
 * anywhere on the title/home screen.
 */
export default function WorldTakeover({
  name,
  lines = ['Lass uns die Welt', 'übernehmen,'],
}: WorldTakeoverProps) {
  return (
    <p className={styles.worldTakeover}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {line}
          {i < lines.length - 1 ? <br /> : ' '}
        </Fragment>
      ))}
      <span className={styles.name}>@{name}</span>
    </p>
  );
}
