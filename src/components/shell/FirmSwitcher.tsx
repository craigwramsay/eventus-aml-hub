'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { switchActiveFirm } from '@/app/actions/firms';
import type { Firm } from '@/app/actions/firms';
import styles from './sidebar.module.css';

interface FirmSwitcherProps {
  firms: Firm[];
  activeFirmId: string;
}

export function FirmSwitcher({ firms, activeFirmId }: FirmSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newFirmId = e.target.value;
    if (newFirmId === activeFirmId) return;

    setError(null);
    startTransition(async () => {
      const result = await switchActiveFirm(newFirmId);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className={styles.firmSwitcher}>
      <select
        className={`${styles.firmSelect} ${isPending ? styles.firmSwitching : ''}`}
        value={activeFirmId}
        onChange={handleChange}
        disabled={isPending}
      >
        {firms.map((firm) => (
          <option key={firm.id} value={firm.id}>
            {firm.name}
          </option>
        ))}
      </select>
      {error && <div className={styles.firmSwitchError}>{error}</div>}
    </div>
  );
}
