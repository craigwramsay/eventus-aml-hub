'use client';

/**
 * Global Assistant Button
 *
 * Floating button that opens the AML assistant panel.
 */

import { useState } from 'react';
import { AssistantPanel } from './AssistantPanel';
import styles from './assistant.module.css';

export function GlobalAssistantButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        className={styles.globalButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close assistant' : 'Open AML assistant'}
        title="AML Assistant"
      >
        {isOpen ? '\u2715' : '?'}
      </button>

      <AssistantPanel isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
