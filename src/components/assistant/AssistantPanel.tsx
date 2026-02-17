'use client';

/**
 * Assistant Panel Component
 *
 * Displays the chat interface for the AML assistant.
 */

import { useState, useRef, useEffect } from 'react';
import type { Citation, UIContext } from '@/lib/assistant/types';
import styles from './assistant.module.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  error?: boolean;
}

interface AssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialContext?: UIContext;
}

export function AssistantPanel({
  isOpen,
  onClose,
  initialContext,
}: AssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    const questionText = input.trim();
    if (!questionText || isLoading) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: questionText,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionText,
          uiContext: initialContext,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response');
      }

      // Add assistant message
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.answer,
        citations: data.citations,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      // Add error message
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: error instanceof Error ? error.message : 'An error occurred',
        error: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>AML Assistant</h2>
        <button
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close assistant"
        >
          &#x2715;
        </button>
      </div>

      {initialContext?.questionText && (
        <div className={styles.contextBanner}>
          <span className={styles.contextLabel}>Question Context: </span>
          {initialContext.questionText}
        </div>
      )}

      <div className={styles.messages}>
        {messages.length === 0 && (
          <div className={styles.assistantMessage}>
            <div className={styles.messageContent}>
              Hello! I can help explain AML compliance requirements based on our
              policy materials. What would you like to know?
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === 'user'
                ? styles.userMessage
                : message.error
                  ? styles.error
                  : styles.assistantMessage
            }
          >
            <div className={styles.messageContent}>{message.content}</div>
            {message.citations && message.citations.length > 0 && (
              <div className={styles.citations}>
                <div className={styles.citationsLabel}>Sources</div>
                <div className={styles.citationsList}>
                  {message.citations.map((citation, index) => (
                    <span key={index} className={styles.citation}>
                      {citation.sourceName}, {citation.sectionRef}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className={styles.loading}>
            <div className={styles.loadingDots}>
              <div className={styles.loadingDot} />
              <div className={styles.loadingDot} />
              <div className={styles.loadingDot} />
            </div>
            Thinking...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className={styles.inputArea} onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about AML compliance..."
          disabled={isLoading}
          rows={1}
        />
        <button
          type="submit"
          className={styles.submitButton}
          disabled={!input.trim() || isLoading}
        >
          Send
        </button>
      </form>
    </div>
  );
}
