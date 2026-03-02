import Link from 'next/link';
import styles from '../page.module.css';

interface StatCardProps {
  label: string;
  value: number | string;
  href?: string;
  variant?: 'default' | 'warning' | 'danger';
}

export function StatCard({ label, value, href, variant = 'default' }: StatCardProps) {
  const variantClass =
    variant === 'warning'
      ? styles.statCardWarning
      : variant === 'danger'
        ? styles.statCardDanger
        : '';

  const content = (
    <div className={`${styles.statCard} ${variantClass}`}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className={styles.statCardLink}>
        {content}
      </Link>
    );
  }

  return content;
}
