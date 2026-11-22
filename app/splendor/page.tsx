import type { Metadata } from 'next';
import Link from 'next/link';
import { GemIcon } from '@/games/splendor/components/art/GemIcon';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { JoinCodeForm } from '@/components/online/JoinCodeForm';
import { GEM_COLORS } from '@/games/splendor/engine';
import { online, strings } from '@/games/splendor/lib/strings';

export const metadata: Metadata = { title: strings.appName };

const linkCard = 'block rounded-xl px-5 py-3 text-left transition-colors';

export default function SplendorHomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-8 px-6 py-10 text-center">
      <div aria-hidden="true" className="flex gap-3">
        {GEM_COLORS.map((c) => (
          <GemIcon key={c} color={c} size="2.25rem" />
        ))}
      </div>
      <div>
        <h1 className="font-display text-5xl font-semibold tracking-wide text-brass sm:text-6xl">
          {strings.appName}
        </h1>
        <p className="mt-3 font-display text-xl opacity-90">{strings.tagline}</p>
      </div>
      <nav aria-label="Play Splendor" className="flex w-full max-w-md flex-col gap-3">
        <JoinCodeForm gameId="splendor" />
        <Link
          href="/splendor/host/"
          className={`${linkCard} bg-brass text-felt-950 hover:bg-[#d9b45c]`}
        >
          <span className="block font-semibold">{online.home.host}</span>
          <span className="block text-sm opacity-80">{online.home.hostHint}</span>
        </Link>
        <Link
          href="/splendor/local/"
          className={`${linkCard} border border-parchment/20 hover:border-brass/60`}
        >
          <span className="block font-semibold">{strings.home.hotseat}</span>
          <span className="block text-sm opacity-80">{strings.home.hotseatHint}</span>
        </Link>
        <div className="flex items-center justify-center gap-6 pt-1 text-sm text-parchment/70">
          <Link href="/splendor/history/" className="underline-offset-4 hover:underline">
            {online.home.history}
          </Link>
          <Link href="/" className="underline-offset-4 hover:underline">
            All games
          </Link>
        </div>
      </nav>
      <ConnectionStatus />
    </main>
  );
}
