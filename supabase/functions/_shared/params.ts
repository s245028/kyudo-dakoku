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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVALID_MESSAGE = '指定が正しくありません。画面を開き直してください。';
/** 一度に指定できる id の数 */
const UUID_LIST_MAX = 1000;

const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

export function uuidParam(params: Params, name: string): string {
  const value = params[name];
  if (!isUuid(value)) throw new AppError(INVALID_MESSAGE);
  return value;
}

export function uuidListParam(params: Params, name: string): string[] {
  const values = params[name];
  if (!Array.isArray(values) || values.length === 0 || values.length > UUID_LIST_MAX) {
    throw new AppError(INVALID_MESSAGE);
  }
  if (!values.every(isUuid)) throw new AppError(INVALID_MESSAGE);
  return values;
}
