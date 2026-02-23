import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/shell/Sidebar';
import { Topbar } from '@/components/shell/Topbar';
import { SidebarProvider } from '@/components/shell/SidebarContext';
import { isPlatformAdmin } from '@/lib/auth/roles';
import { getAllFirms } from '@/app/actions/firms';
import type { UserRole } from '@/lib/auth/roles';
import type { Firm } from '@/app/actions/firms';
import styles from './layout.module.css';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('user_id, email, full_name, role, firm_id')
    .eq('user_id', user.id)
    .single();

  let firm: { name: string; jurisdiction: string } | null = null;
  if (profile?.firm_id) {
    const { data } = await supabase
      .from('firms')
      .select('name, jurisdiction')
      .eq('id', profile.firm_id)
      .single();
    firm = data;
  }

  // Platform admin: fetch all firms for the switcher
  let allFirms: Firm[] | undefined;
  let activeFirmId: string | undefined;
  if (profile?.role && isPlatformAdmin(profile.role as UserRole)) {
    const result = await getAllFirms();
    if (result.success) {
      allFirms = result.firms;
      activeFirmId = profile.firm_id ?? undefined;
    }
  }

  return (
    <SidebarProvider>
      <div className={styles.shell}>
        <Sidebar
          user={{
            email: user.email,
            fullName: profile?.full_name,
            role: profile?.role,
          }}
          firm={firm}
          firms={allFirms}
          activeFirmId={activeFirmId}
        />
        <div className={styles.main}>
          <Topbar />
          <div className={styles.content}>{children}</div>
        </div>
      </div>
    </SidebarProvider>
  );
}
