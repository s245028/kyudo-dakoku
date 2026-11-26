export type Validated<T> = { ok: true; value: T } | { ok: false; message: string };

export function invalid(message: string): { ok: false; message: string } {
  return { ok: false, message };
}
