const BEEP_SECONDS = 0.15;

/** 読み取れたことを、音と振動で伝える。 */
export function successFeedback(entered: boolean): void {
  navigator.vibrate?.(120);
  try {
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = entered ? 1320 : 880;
    gain.gain.value = 0.15;
    oscillator.connect(gain).connect(audio.destination);
    oscillator.onended = () => void audio.close();
    oscillator.start();
    oscillator.stop(audio.currentTime + BEEP_SECONDS);
  } catch {
    // 音が出せない環境では何もしない
  }
}

export function failureFeedback(): void {
  navigator.vibrate?.([80, 60, 80]);
}
