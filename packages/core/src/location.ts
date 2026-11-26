import type { Settings } from './settings.ts';

const EARTH_RADIUS_METERS = 6_371_000;
/** GPS の誤差として差し引く上限 */
export const MAX_GPS_ACCURACY_METERS = 200;

export type Coordinates = { latitude: number; longitude: number };
export type Position = Coordinates & { accuracyMeters: number };

export function distanceMeters(from: Coordinates, to: Coordinates): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitude = radians(to.latitude - from.latitude);
  const longitude = radians(to.longitude - from.longitude);
  const a =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(longitude / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

export type LocationSettings = Pick<
  Settings,
  'dojoLatitude' | 'dojoLongitude' | 'allowedDistanceMeters'
>;

export function requiresLocation(settings: Omit<LocationSettings, 'allowedDistanceMeters'>) {
  return settings.dojoLatitude !== null && settings.dojoLongitude !== null;
}

export type LocationCheck =
  { ok: true; distanceMeters: number | null } | { ok: false; message: string };

/** 道場の近くで読み取ったかを確かめる。道場の位置が未設定なら確かめない。 */
export function checkLocation(
  settings: LocationSettings,
  position: Position | null,
): LocationCheck {
  const { dojoLatitude, dojoLongitude } = settings;
  if (dojoLatitude === null || dojoLongitude === null) return { ok: true, distanceMeters: null };
  if (!position) {
    return {
      ok: false,
      message:
        '位置情報を取得できませんでした。位置情報の利用を許可して、もう一度読み取ってください。',
    };
  }
  const distance = Math.round(
    distanceMeters({ latitude: dojoLatitude, longitude: dojoLongitude }, position),
  );
  const accuracy = Math.min(Math.max(position.accuracyMeters, 0), MAX_GPS_ACCURACY_METERS);
  if (distance - accuracy > settings.allowedDistanceMeters) {
    return {
      ok: false,
      message: `道場から離れすぎています（約${distance}m）。道場で読み取ってください。`,
    };
  }
  return { ok: true, distanceMeters: distance };
}
