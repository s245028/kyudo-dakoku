// CSV に書き出す一覧。列の名前は現行のスプレッドシートに合わせる
import {
  EXCEPTION_LABELS,
  GENDER_LABELS,
  GRADE_LABELS,
  JUDGEMENT_LABELS,
  KOMA_KEYS,
  KOMA_LABELS,
  PART_LABELS,
  PUNCH_LABELS,
  ROLE_LABELS,
  STATUS_LABELS,
  summarizePenalty,
  toClockTime,
  toPracticeDate,
  type CsvValue,
  type ExceptionKind,
  type Gender,
  type Judgement,
  type Koma,
  type Part,
  type PunchKind,
} from '@kyudo/core';
import { readEveryRow } from '../../lib/exportQueries.ts';
import { loadRoster, loadSettings, type RosterEntry } from '../../lib/queries.ts';

export type Table = { header: string[]; rows: CsvValue[][] };

const dateTime = (instant: string | null) => {
  if (!instant) return '';
  const at = new Date(instant);
  return `${toPracticeDate(at)} ${toClockTime(at)}`;
};

/** 部員の id から学生番号と名前を引く */
async function memberDirectory() {
  const roster = await loadRoster();
  const byId = new Map<string, RosterEntry>(roster.map((member) => [member.id, member]));
  return {
    roster,
    who: (id: string | null): [string, string] => {
      const member = id === null ? undefined : byId.get(id);
      return [member?.studentNo ?? '', member?.name ?? ''];
    },
    nameOf: (id: string | null) => (id === null ? '自動' : (byId.get(id)?.name ?? '')),
  };
}

async function members(): Promise<Table> {
  const [roster, extra] = await Promise.all([
    loadRoster(),
    readEveryRow<{ id: string; gender: Gender; registered_at: string }>(
      'members',
      'id, gender, registered_at',
      ['id'],
    ),
  ]);
  return {
    header: ['学生番号', '名前', '学年', '性別', '状態', '役職', '承認', '引退日', '登録日時'],
    rows: roster.map((member) => {
      const more = extra.find((row) => row.id === member.id);
      return [
        member.studentNo,
        member.name,
        GRADE_LABELS[member.grade],
        more ? GENDER_LABELS[more.gender] : '',
        STATUS_LABELS[member.status],
        ROLE_LABELS[member.role],
        member.approved ? '承認済み' : '承認待ち',
        member.retiredOn,
        dateTime(more?.registered_at ?? null),
      ];
    }),
  };
}

type AttendanceRow = {
  practice_date: string;
  member_id: string;
  part: Part;
  deadline: string;
  first_in: string | null;
  last_out: string | null;
  minutes: number;
  auto_result: Judgement;
  late_minutes: number | null;
  manual_result: Judgement | null;
  manual_reason: string;
  final_result: Judgement;
  note: string;
};

async function attendance(): Promise<Table> {
  const [{ who }, rows] = await Promise.all([
    memberDirectory(),
    readEveryRow<AttendanceRow>('attendance', '*', ['practice_date', 'member_id']),
  ]);
  return {
    header: [
      '日付',
      '学生番号',
      '名前',
      '区分',
      '遅刻基準',
      '初回入室',
      '最終退室',
      '在室時間(分)',
      '自動判定',
      '遅刻(分)',
      '手動判定',
      '修正理由',
      '最終判定',
      '備考',
    ],
    rows: rows.map((row) => [
      row.practice_date,
      ...who(row.member_id),
      PART_LABELS[row.part],
      row.deadline.slice(0, 5),
      dateTime(row.first_in),
      dateTime(row.last_out),
      row.minutes,
      JUDGEMENT_LABELS[row.auto_result],
      row.late_minutes,
      row.manual_result ? JUDGEMENT_LABELS[row.manual_result] : '',
      row.manual_reason,
      JUDGEMENT_LABELS[row.final_result],
      row.note,
    ]),
  };
}

type PunchRow = {
  punched_at: string;
  practice_date: string;
  member_id: string;
  kind: PunchKind;
  canceled_at: string | null;
  distance_m: number | null;
  via: 'app' | 'auto';
};

async function punches(): Promise<Table> {
  const [{ who }, rows] = await Promise.all([
    memberDirectory(),
    readEveryRow<PunchRow>('punches', '*', ['punched_at', 'id']),
  ]);
  return {
    header: ['日時', '日付', '学生番号', '名前', '種別', '取消', '距離(m)', '経由'],
    rows: rows.map((row) => [
      dateTime(row.punched_at),
      row.practice_date,
      ...who(row.member_id),
      PUNCH_LABELS[row.kind],
      dateTime(row.canceled_at),
      row.distance_m,
      row.via === 'app' ? 'アプリ' : '自動',
    ]),
  };
}

type PenaltyRow = {
  id: string;
  practice_date: string;
  member_id: string;
  reason: string;
  base_count: number;
  memo: string;
  created_by: string | null;
  completed_on: string | null;
};

type TaskRow = {
  id: string;
  penalty_id: string;
  content: string;
  assigned_at: string;
  assigned_by: string | null;
  done_at: string | null;
  done_by: string | null;
};

const loadPenaltyRows = () => readEveryRow<PenaltyRow>('penalties', '*', ['practice_date', 'id']);
const loadTaskRows = () => readEveryRow<TaskRow>('penalty_tasks', '*', ['assigned_at', 'id']);

async function penalties(today: string): Promise<Table> {
  const [{ who, nameOf }, rows, tasks, settings] = await Promise.all([
    memberDirectory(),
    loadPenaltyRows(),
    loadTaskRows(),
    loadSettings(),
  ]);
  return {
    header: [
      '日付',
      '学生番号',
      '名前',
      '理由',
      '基本の数',
      '残りの数',
      '消化した数',
      '消化日',
      '記録した人',
      'メモ',
    ],
    rows: rows.map((row) => {
      const state = summarizePenalty({
        date: row.practice_date,
        baseCount: row.base_count,
        tasks: tasks
          .filter((task) => task.penalty_id === row.id)
          .map((task) => ({
            id: task.id,
            content: task.content,
            completedOn: task.done_at ? toPracticeDate(new Date(task.done_at)) : null,
          })),
        today,
        doublingDays: settings.penaltyDoublingDays,
      });
      return [
        row.practice_date,
        ...who(row.member_id),
        row.reason,
        row.base_count,
        row.completed_on ? 0 : state.remaining,
        state.paid,
        row.completed_on,
        nameOf(row.created_by),
        row.memo,
      ];
    }),
  };
}

async function tasks(): Promise<Table> {
  const [{ who, nameOf }, penaltyRows, rows] = await Promise.all([
    memberDirectory(),
    loadPenaltyRows(),
    loadTaskRows(),
  ]);
  return {
    header: [
      '罰の日付',
      '学生番号',
      '名前',
      '理由',
      'やること',
      '割り当て日',
      '割り当てた人',
      '消化日',
      '確認した人',
    ],
    rows: rows.map((row) => {
      const penalty = penaltyRows.find((candidate) => candidate.id === row.penalty_id);
      return [
        penalty?.practice_date,
        ...who(penalty?.member_id ?? null),
        penalty?.reason,
        row.content,
        dateTime(row.assigned_at),
        nameOf(row.assigned_by),
        dateTime(row.done_at),
        row.done_by ? nameOf(row.done_by) : '',
      ];
    }),
  };
}

type ExceptionRow = {
  date: string;
  member_id: string | null;
  kind: ExceptionKind;
  memo: string;
  contacted_at: string | null;
};

async function exceptions(): Promise<Table> {
  const [{ who }, rows] = await Promise.all([
    memberDirectory(),
    readEveryRow<ExceptionRow>('exceptions', '*', ['date', 'id']),
  ]);
  return {
    header: ['日付', '学生番号（空欄=全員）', '名前', '内容', 'メモ', '連絡日時'],
    rows: rows.map((row) => [
      row.date,
      ...who(row.member_id),
      EXCEPTION_LABELS[row.kind],
      row.memo,
      dateTime(row.contacted_at),
    ]),
  };
}

async function koma(): Promise<Table> {
  const [{ who }, rows] = await Promise.all([
    memberDirectory(),
    readEveryRow<Koma & { member_id: string; updated_at: string }>('koma', '*', ['member_id']),
  ]);
  return {
    header: ['学生番号', '名前', ...KOMA_KEYS.map((key) => KOMA_LABELS[key]), '更新日時'],
    rows: rows.map((row) => [
      ...who(row.member_id),
      ...KOMA_KEYS.map((key) => (row[key] ? '○' : '')),
      dateTime(row.updated_at),
    ]),
  };
}

export const DATASETS = {
  members: { label: '部員名簿', load: members },
  attendance: { label: '出欠一覧', load: attendance },
  punches: { label: '打刻ログ', load: punches },
  penalties: { label: '罰一覧', load: penalties },
  tasks: { label: '罰の割り当て', load: tasks },
  exceptions: { label: '臨時変更', load: exceptions },
  koma: { label: 'コマ表', load: koma },
} satisfies Record<string, { label: string; load: (today: string) => Promise<Table> }>;

export type DatasetId = keyof typeof DATASETS;
