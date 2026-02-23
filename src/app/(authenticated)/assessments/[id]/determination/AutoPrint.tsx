'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export function AutoPrint() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('print') === 'true') {
      // Small delay to ensure the page has fully rendered
      const timer = setTimeout(() => window.print(), 500);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  return null;
}
