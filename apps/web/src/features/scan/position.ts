export type ScanPosition = { latitude: number; longitude: number; accuracyMeters: number };

const POSITION_TIMEOUT_MS = 8000;
const POSITION_MAX_AGE_MS = 30_000;

/** 現在地。取れなければ null（位置が必要かはサーバーが確かめる） */
export function currentPosition(): Promise<ScanPosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracyMeters: coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: POSITION_TIMEOUT_MS, maximumAge: POSITION_MAX_AGE_MS },
    );
  });
}
