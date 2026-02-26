'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from './SidebarContext';
import { LogoutButton } from './LogoutButton';
import { FirmSwitcher } from './FirmSwitcher';
import type { Firm } from '@/app/actions/firms';
import styles from './sidebar.module.css';

interface SidebarProps {
  user: {
    email: string | undefined;
    fullName: string | null | undefined;
    role: string | null | undefined;
  };
  firm: {
    name: string;
    jurisdiction: string;
  } | null;
  firms?: Firm[];
  activeFirmId?: string;
}

const ROLE_LABELS: Record<string, string> = {
  solicitor: 'Solicitor',
  mlro: 'MLRO',
  admin: 'Admin',
  platform_admin: 'Platform Admin',
};

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  integrationsOnly?: boolean;
}

/* Simple inline SVG icons */
function DashboardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="11" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="11" width="6" height="6" rx="1" />
      <rect x="11" y="11" width="6" height="6" rx="1" />
    </svg>
  );
}

function ClientsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="6" r="3" />
      <path d="M2 17c0-3 2.5-5 5-5s5 2 5 5" />
      <circle cx="14" cy="6" r="2" />
      <path d="M14 11c2 0 4 1.5 4 4" />
    </svg>
  );
}

function MattersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4.5A1.5 1.5 0 014.5 3h3l2 2h6A1.5 1.5 0 0117 6.5v8a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 14.5z" />
    </svg>
  );
}

function AssessmentsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="12" height="16" rx="1.5" />
      <path d="M7 6h6M7 9h6M7 12h4" />
      <path d="M13 14l1 1 2-2.5" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="7" r="3" />
      <path d="M4 17c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5" />
      <path d="M14.5 3.5l1 1 2-2" />
    </svg>
  );
}

function IntegrationsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10h4M12 10h4" />
      <circle cx="10" cy="10" r="2" />
      <path d="M10 3v5M10 12v5" />
      <circle cx="4" cy="10" r="1.5" />
      <circle cx="16" cy="10" r="1.5" />
    </svg>
  );
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {collapsed ? (
        <path d="M7 4l6 6-6 6" />
      ) : (
        <path d="M13 4l-6 6 6 6" />
      )}
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { href: '/clients', label: 'Clients', icon: <ClientsIcon /> },
  { href: '/matters', label: 'Matters', icon: <MattersIcon /> },
  { href: '/assessments', label: 'Assessments', icon: <AssessmentsIcon /> },
  { href: '/users', label: 'User Management', icon: <UsersIcon />, adminOnly: true },
  { href: '/settings/integrations', label: 'Integrations', icon: <IntegrationsIcon />, integrationsOnly: true },
];

export function Sidebar({ user, firm, firms, activeFirmId }: SidebarProps) {
  const pathname = usePathname();
  const { isCollapsed, isMobileOpen, toggleCollapse, closeMobile } = useSidebar();

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  const canManageUsers = user.role === 'admin' || user.role === 'platform_admin';
  const canViewIntegrations = user.role === 'mlro' || user.role === 'admin' || user.role === 'platform_admin';

  const sidebarClasses = [
    styles.sidebar,
    isCollapsed ? styles.collapsed : '',
    isMobileOpen ? styles.mobileOpen : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isMobileOpen && (
        <div className={styles.overlay} onClick={closeMobile} />
      )}

      <aside className={sidebarClasses}>
        {/* Firm header */}
        <div className={styles.firmHeader}>
          {!isCollapsed && (
            <>
              {firms && activeFirmId ? (
                <FirmSwitcher firms={firms} activeFirmId={activeFirmId} />
              ) : (
                <div className={styles.firmName}>{firm?.name ?? 'AML Hub'}</div>
              )}
              {firm?.jurisdiction && (
                <div className={styles.firmJurisdiction}>{firm.jurisdiction}</div>
              )}
            </>
          )}
          {isCollapsed && (
            <div className={styles.firmLogo}>E</div>
          )}
          {/* Mobile close button */}
          <button className={styles.mobileClose} onClick={closeMobile} aria-label="Close menu">
            <CloseIcon />
          </button>
        </div>

        {/* Navigation */}
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => {
            if (item.adminOnly && !canManageUsers) return null;
            if (item.integrationsOnly && !canViewIntegrations) return null;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
                onClick={closeMobile}
                title={isCollapsed ? item.label : undefined}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                {!isCollapsed && <span className={styles.navLabel}>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className={styles.spacer} />

        {/* Collapse toggle (desktop only) */}
        <button className={styles.collapseToggle} onClick={toggleCollapse} aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <CollapseIcon collapsed={isCollapsed} />
          {!isCollapsed && <span>Collapse</span>}
        </button>

        {/* User section */}
        <div className={styles.userSection}>
          {!isCollapsed ? (
            <>
              <div className={styles.userName}>{user.fullName ?? user.email ?? 'User'}</div>
              {user.role && (
                <div className={styles.userRole}>{ROLE_LABELS[user.role] ?? user.role}</div>
              )}
              <LogoutButton />
            </>
          ) : (
            <div className={styles.userAvatar} title={user.fullName ?? user.email ?? 'User'}>
              {(user.fullName ?? user.email ?? 'U').charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
