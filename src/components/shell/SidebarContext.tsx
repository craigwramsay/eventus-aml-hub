'use client';

import { createContext, useContext, useState, useCallback, useSyncExternalStore, type ReactNode } from 'react';

interface SidebarContextValue {
  isCollapsed: boolean;
  isMobileOpen: boolean;
  toggleCollapse: () => void;
  toggleMobile: () => void;
  closeMobile: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

const STORAGE_KEY = 'sidebar-collapsed';

/** Read collapsed preference from localStorage via useSyncExternalStore */
function subscribeToStorage(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getStorageSnapshot(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

function getServerSnapshot(): boolean {
  return false;
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const storedCollapsed = useSyncExternalStore(subscribeToStorage, getStorageSnapshot, getServerSnapshot);
  const [localCollapsed, setLocalCollapsed] = useState<boolean | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Use local state if user has toggled this session, otherwise use stored value
  const isCollapsed = localCollapsed ?? storedCollapsed;

  const toggleCollapse = useCallback(() => {
    setLocalCollapsed((prev) => {
      const current = prev ?? storedCollapsed;
      const next = !current;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, [storedCollapsed]);

  const toggleMobile = useCallback(() => {
    setIsMobileOpen((prev) => !prev);
  }, []);

  const closeMobile = useCallback(() => {
    setIsMobileOpen(false);
  }, []);

  return (
    <SidebarContext value={{
      isCollapsed,
      isMobileOpen,
      toggleCollapse,
      toggleMobile,
      closeMobile,
    }}>
      {children}
    </SidebarContext>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return ctx;
}
