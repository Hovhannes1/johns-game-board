import type { Metadata } from 'next';
import Link from 'next/link';
import { strings } from '@/games/bazar-blot/lib/strings';

export const metadata: Metadata = { title: `Rules — ${strings.appName}` };

export default function BazarBlotRulesPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center gap-4">
        <h1 className="font-display text-4xl font-semibold text-brass">
          {strings.appName} — Rules
        </h1>
        <Link
          href="/bazar-blot/"
          className="ml-auto text-sm text-parchment/70 underline-offset-4 hover:underline"
        >
          Back
        </Link>
      </header>
      <section className="flex flex-col gap-3 text-sm leading-relaxed text-parchment/85">
        <p>
          <strong>Objective:</strong> Four players form two teams of two (partners sit across from
          each other). Play uses a 32-card deck (7 through Ace). The first team to reach the target
          score (101, 151, 201, or 301) wins the match.
        </p>
        <p>
          <strong>The Bazar:</strong> Players bid &ldquo;X of suit&rdquo; (8–25 in ♠ ♥ ♦ ♣ or Boy
          no-trump) or declare <em>Kaput</em> (win all 8 tricks). Defenders may declare{' '}
          <em>Kontra</em>; the bidding team may respond with <em>Rekontra</em>. Four consecutive
          passes end the bidding (or trigger a redeal if no one bid).
        </p>
        <p>
          <strong>Playing tricks:</strong> You must follow the led suit if able. When void, you must
          play a trump (and over-trump if possible), unless your partner is already winning the
          trick. In Boy contracts, follow suit or play any card.
        </p>
        <p>
          <strong>Card values:</strong> Trump: J (20), 9 (14), A (11), 10 (10), K (4), Q (3). Other
          suits: A (11), 10 (10), K (4), Q (3), J (2). Boy: A (19), 10 (10), K (4), Q (3), J (2).
          Last trick adds +10 points (162 total per round).
        </p>
        <p>
          <strong>Combinations:</strong> Terz (3 in a row, 20 pts), 50 (4 in a row, 50 pts), 100 (5+
          in a row, 100 pts), and Four of a kind (100–200 pts). Only the winning team&apos;s
          combinations score after trick 1; Blot-Reblot (K + Q of trump, 20 pts) always counts.
        </p>
        <p>
          <strong>Reverse Kaput:</strong> If the bidding team wins 0 tricks, they lose the match
          immediately regardless of score.
        </p>
      </section>
    </main>
  );
}
