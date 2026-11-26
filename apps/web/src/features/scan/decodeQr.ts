/** 映像の1コマから QR を読む。読めなければ null */
export type QrDecoder = (video: HTMLVideoElement) => Promise<string | null>;

type NativeDetector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type NativeDetectorClass = {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
};

/** jsQR で解析するときの映像の幅。小さくして速くする */
const ANALYSIS_WIDTH = 480;

async function nativeDecoder(): Promise<QrDecoder | null> {
  const Detector = (window as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (!Detector) return null;
  const formats = await Detector.getSupportedFormats().catch((): string[] => []);
  if (!formats.includes('qr_code')) return null;
  const detector = new Detector({ formats: ['qr_code'] });
  return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
}

async function libraryDecoder(): Promise<QrDecoder> {
  // ブラウザが QR を読めないときだけ読み込む
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return (video) => {
    if (!context || !video.videoWidth) return Promise.resolve(null);
    canvas.width = ANALYSIS_WIDTH;
    canvas.height = Math.round((video.videoHeight * ANALYSIS_WIDTH) / video.videoWidth);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(image.data, image.width, image.height, {
      inversionAttempts: 'dontInvert',
    });
    return Promise.resolve(code?.data || null);
  };
}

export async function createQrDecoder(): Promise<QrDecoder> {
  return (await nativeDecoder()) ?? libraryDecoder();
}
