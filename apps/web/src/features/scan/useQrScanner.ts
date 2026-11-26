import { useEffect, useEffectEvent, useState, type RefObject } from 'react';
import { createQrDecoder } from './decodeQr.ts';

const CAMERA_ERROR = 'カメラを使えません。カメラの利用を許可してください。';

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/** `active` の間カメラを動かし、QR を1つ読んだら `onDetected` を呼んで止める。 */
export function useQrScanner(
  videoRef: RefObject<HTMLVideoElement | null>,
  active: boolean,
  onDetected: (text: string) => void,
) {
  const [error, setError] = useState<string | null>(null);
  const detected = useEffectEvent(onDetected);

  useEffect(() => {
    const video = videoRef.current;
    if (!active || !video) return;
    let stopped = false;
    let stream: MediaStream | undefined;
    const stop = () => {
      stopped = true;
      stream?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    };

    async function run(target: HTMLVideoElement) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      if (stopped) return stop();
      setError(null);
      target.srcObject = stream;
      await target.play().catch(() => {});
      const decode = await createQrDecoder();
      while (!stopped) {
        const ready = target.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
        const text = ready ? await decode(target).catch(() => null) : null;
        if (text && !stopped) {
          stop();
          detected(text);
          return;
        }
        await nextFrame();
      }
    }

    run(video).catch(() => {
      if (!stopped) setError(CAMERA_ERROR);
    });
    return stop;
  }, [active, videoRef]);

  return active ? error : null;
}
