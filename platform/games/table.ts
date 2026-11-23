import type { ReactNode } from 'react';

export interface IntentError {
  code: string;
  message: string;
}

export interface OnlineTableProps<View = unknown, Intent = unknown> {
  view: View;
  onIntent: (intent: Intent) => IntentError | null | Promise<IntentError | null>;
  presence?: ReadonlyMap<string, boolean>;
  turnDeadline?: number | null;
  clockOffset?: number;
  statusChip?: ReactNode;
  side?: ReactNode;
  onPlayAgain?: () => void;
  endNote?: string;
  onExit: () => void;
  exitCopy: { title: string; body: string; confirm: string };
}
