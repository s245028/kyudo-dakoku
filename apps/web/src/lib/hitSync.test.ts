import { beforeEach, describe, expect, it, vi } from 'vitest';

const callAction = vi.fn();
vi.mock('./api.ts', () => {
  class ApiError extends Error {}
  class OfflineError extends ApiError {}
  return { ApiError, OfflineError, callAction };
});

const stored = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => void stored.set(key, value),
});

const { ApiError, OfflineError } = await import('./api.ts');
const sync = await import('./hitSync.ts');

const target = { memberId: 'm1', date: '2026-11-28', category: 'drill' } as const;
const draft = () => sync.readDrafts()[sync.draftKey(target)];
const saved = (revision: number) => ({
  conflict: false,
  records: [{ category: 'drill', revision }],
});

beforeEach(() => {
  vi.useFakeTimers();
  callAction.mockReset();
  sync.discardDraft(target);
});

describe('下書き', () => {
  it('入力は端末に残り、手が止まってから保存して下書きを消す', async () => {
    callAction.mockResolvedValue(saved(1));

    sync.putDraft(target, [[1, null, null, null]], null);
    expect(stored.get('hit-drafts')).toContain('m1/2026-11-28/drill');
    await vi.advanceTimersByTimeAsync(2999);
    expect(callAction).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(callAction).toHaveBeenCalledWith('save-hits', {
      memberId: 'm1',
      date: '2026-11-28',
      entries: [
        { category: 'drill', mode: 'shots', rows: [[1, null, null, null]], baseRevision: null },
      ],
    });
    expect(draft()).toBeUndefined();
  });

  it('届かなければ残して、あとで送り直す', async () => {
    callAction.mockRejectedValueOnce(new OfflineError()).mockResolvedValue(saved(1));

    sync.putDraft(target, [[1, 1, null, null]], 4);
    await vi.advanceTimersByTimeAsync(3000);
    expect(draft()).toMatchObject({ baseRevision: 4 });
    await vi.advanceTimersByTimeAsync(15_000);

    expect(callAction).toHaveBeenCalledTimes(2);
    expect(draft()).toBeUndefined();
  });

  it('送っている間に入力が増えたら、新しい番号で続ける', async () => {
    callAction.mockImplementationOnce(() => {
      sync.putDraft(target, [[1, 0, null, null]], null);
      return Promise.resolve(saved(7));
    });
    callAction.mockResolvedValue(saved(8));

    sync.putDraft(target, [[1, null, null, null]], null);
    await sync.flushDrafts();
    expect(draft()).toMatchObject({ baseRevision: 7, rows: [[1, 0, null, null]] });
    await vi.advanceTimersByTimeAsync(3000);

    expect(draft()).toBeUndefined();
  });

  it('ほかで変わっていたら上書きせず、選ぶまで送らない', async () => {
    callAction.mockResolvedValue({ conflict: true, records: [] });

    sync.putDraft(target, [[1, null, null, null]], 1);
    await vi.advanceTimersByTimeAsync(3000);
    sync.putDraft(target, [[1, 1, null, null]], 1);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(callAction).toHaveBeenCalledTimes(1);
    expect(draft()?.problem).toMatchObject({ conflict: true });

    callAction.mockResolvedValue(saved(9));
    sync.overwriteWithDraft(target, 5);
    await vi.advanceTimersByTimeAsync(0);

    expect(callAction).toHaveBeenLastCalledWith(
      'save-hits',
      expect.objectContaining({ entries: [expect.objectContaining({ baseRevision: 5 })] }),
    );
    expect(draft()).toBeUndefined();
  });

  it('断られたら理由を残し、直すとまた送る', async () => {
    callAction.mockRejectedValueOnce(new ApiError('先の日の記録は入れられません。'));

    sync.putDraft(target, [[1, null, null, null]], null);
    await vi.advanceTimersByTimeAsync(3000);

    expect(draft()?.problem).toEqual({
      conflict: false,
      message: '先の日の記録は入れられません。',
    });

    callAction.mockResolvedValue(saved(1));
    sync.putDraft(target, [[0, null, null, null]], null);
    await vi.advanceTimersByTimeAsync(3000);

    expect(draft()).toBeUndefined();
  });
});
