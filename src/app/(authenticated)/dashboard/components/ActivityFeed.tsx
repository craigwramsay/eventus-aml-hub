import Link from 'next/link';
import type { ActivityFeedItem } from '@/app/actions/dashboard';
import styles from '../page.module.css';

interface ActivityFeedProps {
  items: ActivityFeedItem[];
  title?: string;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

export function ActivityFeed({ items, title = 'Recent Activity' }: ActivityFeedProps) {
  return (
    <section className={styles.feedSection}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {items.length === 0 ? (
        <p className={styles.emptyState}>No recent activity</p>
      ) : (
        <ul className={styles.feedList}>
          {items.map((item) => (
            <li key={item.id} className={styles.feedItem}>
              <div className={styles.feedItemContent}>
                {item.link ? (
                  <Link href={item.link} className={styles.feedItemLink}>
                    {item.description}
                  </Link>
                ) : (
                  <span>{item.description}</span>
                )}
                <span className={styles.feedItemMeta}>
                  {item.createdByName} &middot; {relativeTime(item.createdAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
