import type { ClockTime } from './date.ts';

export type Settings = {
  /** 入口に貼った QR の中身。値はリポジトリに書かない */
  entranceQr: string;
  /** 緯度・経度のどちらかが null なら位置チェックをしない */
  dojoLatitude: number | null;
  dojoLongitude: number | null;
  allowedDistanceMeters: number;
  duplicateScanSeconds: number;
  undoSeconds: number;
  autoCheckoutTime: ClockTime;
  komaLocked: boolean;
  /** 集合時刻の何分前までの連絡を締め切り内とするか */
  noticeLeadMinutes: number;
  penaltyDoublingDays: number;
};

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  entranceQr: '',
  dojoLatitude: null,
  dojoLongitude: null,
  allowedDistanceMeters: 150,
  duplicateScanSeconds: 120,
  undoSeconds: 60,
  autoCheckoutTime: '22:00',
  komaLocked: false,
  noticeLeadMinutes: 60,
  penaltyDoublingDays: 7,
};
