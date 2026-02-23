'use client';

import { useSidebar } from './SidebarContext';
import styles from './topbar.module.css';

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 5h14M3 10h14M3 15h14" />
    </svg>
  );
}

export function Topbar() {
  const { toggleMobile } = useSidebar();

  return (
    <header className={styles.topbar}>
      <button
        className={styles.hamburger}
        onClick={toggleMobile}
        aria-label="Open menu"
      >
        <HamburgerIcon />
      </button>

      <div className={styles.search}>
        <input
          type="text"
          placeholder="Search..."
          className={styles.searchInput}
          disabled
          title="Search (coming soon)"
        />
      </div>

      <div className={styles.actions}>
        {/* Placeholder for future actions */}
      </div>
    </header>
  );
}
