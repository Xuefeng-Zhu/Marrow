import { useEffect, useRef, type ReactNode } from 'react';
import styles from './Layout.module.css';

export interface LayoutProps {
  /** The one `h1` of the screen. It also becomes the document title and takes focus (R14.4). */
  title: string;
  children: ReactNode;
  /** Wider layout for the live session. */
  wide?: boolean;
}

export const APP_NAME = 'Rattle Reps';

/** Shared page frame: a header, a `main` and one `h1` that receives focus when the screen changes. */
export function Layout({ title, children, wide }: LayoutProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = `${title} | ${APP_NAME}`;
    heading.current?.focus();
  }, [title]);
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brand}>
          <svg className={styles.logo} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <circle cx="16" cy="14" r="9" fill="currentColor" />
            <rect x="11" y="21" width="10" height="7" rx="2" fill="currentColor" />
            <circle cx="12.5" cy="14" r="2.4" fill="#0b0820" />
            <circle cx="19.5" cy="14" r="2.4" fill="#0b0820" />
          </svg>
          {APP_NAME}
        </span>
      </header>
      <main className={`${styles.main} ${wide ? styles.wide : ''}`}>
        <h1 ref={heading} tabIndex={-1} className={styles.title}>
          {title}
        </h1>
        {children}
      </main>
    </div>
  );
}
