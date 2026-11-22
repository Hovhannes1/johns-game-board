import Link from 'next/link';
import { GemIcon } from '@/games/splendor/components/art/GemIcon';
import { GEM_COLORS } from '@/games/splendor/engine';
import { listGames } from '@/platform/games/registry';
import { JoinCodeForm } from '@/components/online/JoinCodeForm';
import { ResumeCard } from '@/components/platform/ResumeCard';

export default function GalleryPage() {
  const games = listGames();

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col items-center justify-center gap-10 px-6 py-12 text-center">
      <header className="flex flex-col items-center gap-3">
        <p className="text-xs tracking-[0.25em] text-brass/80 uppercase">Peer-to-Peer Tabletop</p>
        <h1 className="font-display text-5xl font-semibold tracking-wide text-brass sm:text-6xl">
          John&apos;s Game Board
        </h1>
        <p className="max-w-xl font-display text-lg text-parchment/85">
          Pick a board game to host or play locally, or paste a room code to join a friend&apos;s
          table directly in your browser.
        </p>
      </header>

      <section aria-label="Available games" className="grid w-full gap-4 sm:grid-cols-2">
        {games.map((game) => (
          <Link
            key={game.id}
            href={`/${game.id}/`}
            className="group flex flex-col justify-between gap-4 rounded-2xl border border-brass/35 bg-felt-900/80 p-6 text-left shadow-xl transition-colors hover:border-brass hover:bg-felt-900"
          >
            <div className="flex flex-col gap-3">
              {game.id === 'splendor' && (
                <div aria-hidden="true" className="flex gap-2">
                  {GEM_COLORS.map((c) => (
                    <GemIcon key={c} color={c} size="1.5rem" />
                  ))}
                </div>
              )}
              <div>
                <h2 className="font-display text-2xl font-semibold text-brass group-hover:underline">
                  {game.title}
                </h2>
                <p className="mt-1 text-sm text-parchment/80">{game.tagline}</p>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-parchment/65">
              <span>
                {game.minPlayers}–{game.maxPlayers} players
              </span>
              <span className="font-semibold text-brass">Play →</span>
            </div>
          </Link>
        ))}
      </section>

      <div className="flex w-full max-w-md flex-col gap-4">
        <ResumeCard />
        <JoinCodeForm gameId="splendor" />
      </div>
    </main>
  );
}
