import type { PunchKind } from '@kyudo/core';

export type ScanResponse =
  | { duplicate: true; kind: PunchKind; time: string }
  | {
      duplicate: false;
      id: number;
      kind: PunchKind;
      time: string;
      message: string;
      lateMinutes: number;
      penaltyAdded: boolean;
      undoSeconds: number;
    };

export type ScanOutcome =
  | { type: 'recorded'; scan: ScanResponse }
  | { type: 'undone' }
  | { type: 'failed'; message: string };
