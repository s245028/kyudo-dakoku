/** ファイルを端末に保存する。スマホは共有の画面を使い、使えなければダウンロードする。 */
export async function saveFile(file: File): Promise<void> {
  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    // 共有の画面を閉じただけのときは何もしない
    await navigator.share({ files: [file] }).catch(() => {});
    return;
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
