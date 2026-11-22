import type { Metadata } from 'next';
import { HostDashboard } from '@/components/online/HostDashboard';
import { online, strings } from '@/games/splendor/lib/strings';

export const metadata: Metadata = { title: `${online.host.title} · ${strings.appName}` };

export default function HostPage() {
  return <HostDashboard />;
}
