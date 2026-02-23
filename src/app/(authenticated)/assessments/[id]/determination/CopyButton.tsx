'use client';

/**
 * Copy Button Component
 *
 * Copies text to clipboard with visual feedback.
 */

import { useState } from 'react';
import styles from './page.module.css';

interface CopyButtonProps {
  text: string;
}

export function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <button
      className={`${styles.copyButton} ${copied ? styles.copyButtonSuccess : ''}`}
      onClick={handleCopy}
      aria-label={copied ? 'Copied!' : 'Copy to clipboard'}
    >
      {copied ? (
        <>
          <span>&#10003;</span>
          <span>Copied</span>
        </>
      ) : (
        <>
          <span>&#128203;</span>
          <span>Copy</span>
        </>
      )}
    </button>
  );
}
