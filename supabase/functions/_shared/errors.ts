/** 利用者にそのまま見せるエラー */
export class AppError extends Error {}

export function refuseIf(message: string | null): void {
  if (message !== null) throw new AppError(message);
}
