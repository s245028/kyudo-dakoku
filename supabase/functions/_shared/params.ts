import { AppError } from './errors.ts';

/** アプリから届いた値。型は信用せず、使う前に確かめる */
export type Params = Readonly<Record<string, unknown>>;

export function stringParam(params: Params, name: string): string {
  const value = params[name];
  return typeof value === 'string' ? value : '';
}

export function booleanParam(params: Params, name: string): boolean {
  return params[name] === true;
}

export function objectParam(params: Params, name: string): Params {
  const value = params[name];
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Params)
    : {};
}

export function uuidParam(params: Params, name: string): string {
  const value = stringParam(params, name);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new AppError('指定が正しくありません。画面を開き直してください。');
  }
  return value;
}
