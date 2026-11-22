import type { Metadata } from 'next';
import { HistoryList } from '@/components/online/HistoryList';
import { online, strings } from '@/lib/strings';

export const metadata: Metadata = { title: `${online.history.title} · ${strings.appName}` };

export default function HistoryPage() {
  return <HistoryList />;
}
