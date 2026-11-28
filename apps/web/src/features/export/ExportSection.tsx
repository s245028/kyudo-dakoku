import { DataExport } from './DataExport.tsx';
import { PosterExport } from './PosterExport.tsx';

export function ExportSection({
  today,
  canExportData,
}: {
  today: string;
  /** 記録の一覧も書き出せる人（主将と管理者）か */
  canExportData: boolean;
}) {
  return (
    <>
      <PosterExport today={today} />
      {canExportData && <DataExport today={today} />}
    </>
  );
}
