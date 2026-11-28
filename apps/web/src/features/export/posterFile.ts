// Excel のファイルを作る。大きい部品なので、使うときだけ読み込む
import type { Poster } from '@kyudo/core';
import writeExcelFile, { type Feature } from 'write-excel-file/browser';
import {
  appendMarkupInsideElement,
  findElement,
  prependMarkupInsideElement,
} from 'write-excel-file/utility';
import { posterSheet } from './posterSheet.ts';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** 用紙の決まり。余白の単位はインチ */
const PAGE_MARGINS =
  '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>';
/** A4（9）の縦。列が次の紙に分かれないように、横幅は1枚に合わせて縮める */
const PAGE_SETUP =
  '<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>';
const FIT_TO_PAGE = '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>';

/** 表の XML に、用紙の決まりを足す。要素の順は決まっていて、前と後ろに分かれる */
function withPageSetup(xml: string): string {
  const sheet = findElement(xml, 'worksheet');
  if (!sheet) return xml;
  const appended = appendMarkupInsideElement(xml, sheet, PAGE_MARGINS + PAGE_SETUP);
  return prependMarkupInsideElement(appended, findElement(appended, 'worksheet')!, FIT_TO_PAGE);
}

const pageSettings: Feature<File | Blob | ArrayBuffer> = {
  files: { transform: { 'xl/worksheets/sheet{id}.xml': { transform: withPageSetup } } },
};

export async function posterFile(poster: Poster): Promise<File> {
  const { data, widths } = posterSheet(poster);
  const blob = await writeExcelFile(
    data,
    {
      columns: widths.map((width) => ({ width })),
      sheet: '順位',
      showGridLines: false,
    },
    { features: [pageSettings] },
  ).toBlob();
  return new File([blob], `${poster.title.replace(/\s+/g, '_')}.xlsx`, { type: XLSX_TYPE });
}
