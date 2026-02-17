'use client';

/**
 * Question Helper Button
 *
 * Button that opens the assistant with context about a specific question.
 */

import { useState } from 'react';
import { AssistantPanel } from './AssistantPanel';
import type { UIContext } from '@/lib/assistant/types';
import styles from './assistant.module.css';

interface QuestionHelperButtonProps {
  /** The question ID from the form */
  questionId: string;
  /** The question text */
  questionText: string;
}

export function QuestionHelperButton({
  questionId,
  questionText,
}: QuestionHelperButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const uiContext: UIContext = {
    questionId,
    questionText,
  };

  return (
    <>
      <button
        className={styles.questionHelper}
        onClick={() => setIsOpen(true)}
        aria-label="Get help with this question"
        title="Ask the AML assistant about this question"
      >
        <span>?</span>
        <span>Help</span>
      </button>

      <AssistantPanel
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        initialContext={uiContext}
      />
    </>
  );
}
