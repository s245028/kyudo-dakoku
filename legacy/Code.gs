/**
 * 弓道部 道場打刻・出欠管理（第1段階）
 *
 * 使い方：空のGoogleスプレッドシートで「拡張機能 > Apps Script」を開き、
 * このファイルの中身を貼り付けて setup を実行する。詳しくは README.md。
 */

const TZ = 'Asia/Tokyo';

const SHEET = {
  SETTINGS: '設定',
  RULES: '練習ルール',
  MEMBERS: '部員名簿',
  KOMA: 'コマ表',
  EXCEPTIONS: '臨時変更',
  LOG: '打刻ログ',
  PRESENCE: '在室状況',
  ATTENDANCE: '出欠一覧',
  PENALTY: '罰一覧',
  PTYPES: '罰の種類',
  PSTATS: '罰の集計',
  TASKS: '罰の割り当て',
};

const HEADERS = {
  [SHEET.SETTINGS]: ['項目', '値', '説明'],
  [SHEET.RULES]: ['曜日', '条件', '区分', '遅刻基準', '練習開始'],
  [SHEET.MEMBERS]: ['学生番号', '名前', '学年', '状態', '識別キー', '登録URL', '承認', '登録日時', '性別', '役職', '引退日'],
  [SHEET.KOMA]: ['学生番号', '名前', '月4', '月5', '火4', '火5', '木4', '木5', '更新日時'],
  [SHEET.EXCEPTIONS]: ['日付', '学生番号（空欄=全員）', '内容', 'メモ', '連絡日時'],
  [SHEET.LOG]: ['ID', '日時', '日付', '学生番号', '名前', '種別', '取消', '距離(m)', '経由'],
  [SHEET.PRESENCE]: ['名前', '学生番号', '入室時刻'],
  [SHEET.ATTENDANCE]: ['日付', '曜日', '学生番号', '名前', '区分', '遅刻基準', '初回入室', '最終退室',
    '在室時間(分)', '自動判定', '遅刻(分)', '手動判定', '修正理由', '最終判定', '備考'],
  [SHEET.PENALTY]: ['ID', '日付', '学生番号', '名前', '理由', '基本の数', '経過日数', '残りの数',
    '消化済み', '消化日', '記録した人', 'メモ', '自動キー', '消化した数'],
  [SHEET.TASKS]: ['ID', '罰ID', '罰の日付', '学生番号', '名前', '理由', 'やること', '割り当て日', '割り当てた人',
    '消化済み', '消化日', '確認した人'],
  [SHEET.PTYPES]: ['理由', '基本の数', 'つけ方', '説明'],
};

// 罰一覧の列（1始まり）
const PC = { ID: 1, DATE: 2, SID: 3, NAME: 4, REASON: 5, BASE: 6, DAYS: 7, COUNT: 8, DONE: 9, DONE_AT: 10, BY: 11, MEMO: 12, AUTO: 13, PAID: 14 };
// 罰の割り当ての列（1始まり）
const TC = { ID: 1, PID: 2, PDATE: 3, SID: 4, NAME: 5, REASON: 6, CONTENT: 7, AT: 8, BY: 9, DONE: 10, DONE_AT: 11, DONE_BY: 12 };

const DEFAULT_SETTINGS = [
  ['アプリURL', '', '公開した打刻アプリのURL（登録URLの作成に使う）'],
  ['入口QR', '', '入口に貼るQRコードの中身。初期設定で自動生成される'],
  ['道場の緯度', '', '空欄なら位置チェックをしない'],
  ['道場の経度', '', '空欄なら位置チェックをしない'],
  ['許容距離(m)', 150, '道場からこの距離以内なら打刻できる'],
  ['二重読み取りを無視する秒数', 120, '直前の打刻からこの秒数以内の読み取りは無視する'],
  ['取り消しできる秒数', 60, '打刻後この秒数以内ならアプリから取り消せる'],
  ['自動退室の時刻', '22:00', 'この時刻に在室中の人を自動退室にする（変えたら初期設定を再実行）'],
  ['コマ表ロック', false, 'チェックを入れると部員がアプリからコマ表を変更できなくなる'],
  ['連絡の締め切り（集合の何分前）', 60, 'この時刻までに主将へ連絡した遅刻・欠席は罰なし。過ぎたら罰'],
  ['罰が倍になる日数', 7, '罰がついてからこの日数がたつごとに、罰の数が2倍になる'],
];

// 罰の種類（基本の数は罰の種類シートで変えられる）
const DEFAULT_PTYPES = [
  ['遅刻', 1, '自動', '集合時間に遅れて入室し、事前の連絡がない'],
  ['遅刻（連絡遅れ）', 1, '自動', '遅刻の連絡が締め切りを過ぎていた'],
  ['無断欠席', 1, '自動', '入室の記録がなく、欠席の連絡もない'],
  ['欠席（連絡遅れ）', 1, '自動', '欠席の連絡が締め切りを過ぎていた'],
  ['私物の出しっぱなし', 1, '副務', '道場に私物を置いたままにした'],
  ['その他', 1, '副務', '上にない罰。メモに内容を書く'],
];
const AUTO_PENALTY_REASONS = ['遅刻', '遅刻（連絡遅れ）', '無断欠席', '欠席（連絡遅れ）'];
const JUDGEMENTS = ['出席', '遅刻', '遅刻（連絡済）', '遅刻（連絡遅れ）', '無断欠席', '欠席（連絡済）', '欠席（連絡遅れ）', '対象外'];
const ROLES = ['部員', '主将', '副務'];
// 部員の状態。引退した人は「参加」を登録した日だけ出欠を判定する
const STATUSES = ['現役', '引退', '休部・退部', '卒業'];
const GRADE_UP = { '1年': '2年', '2年': '3年', '3年': '4年', '院1年': '院2年' };
const GRADUATING = ['4年', '院2年'];
const OFFICER_ROLES = ['主将', '副務'];

const RULE_CONDITIONS = ['全員', '4・5コマなし', '4コマあり', '5コマあり'];
const DEFAULT_RULES = (() => {
  const rows = [];
  ['月', '火', '木'].forEach(d => {
    rows.push([d, '4・5コマなし', '前半', '17:00', '17:30']);
    rows.push([d, '4コマあり', '前半', '17:30', '17:30']);
    rows.push([d, '5コマあり', '後半', '19:15', '19:45']);
  });
  rows.push(['土', '全員', '全体', '08:20', '09:15']);
  return rows;
})();

const EXCEPTION_TYPES = ['休み', '4・5コマなし', '4コマあり', '5コマあり', '欠席連絡済', '遅刻連絡済', '参加'];
const JOIN_DAYS_AHEAD = 14; // 引退した人がアプリで参加を登録できる先の日数
const GENDERS = ['男', '女'];
const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];
const KOMA_KEYS = ['月4', '月5', '火4', '火5', '木4', '木5'];
const TYPE_IN = '入室';
const TYPE_OUT = '退室';
const TYPE_AUTO_OUT = '自動退室';
const RECENT_LOG_ROWS = 3000;

/* ========== メニュー ========== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('出席管理')
    .addItem('今日の出欠を判定', 'judgeTodayMenu')
    .addItem('日付を指定して判定', 'judgeDateMenu')
    .addSeparator()
    .addItem('識別キーと登録URLを発行', 'issueKeys')
    .addSeparator()
    .addItem('代替わり（引退・役職の交代）', 'changeGenerationMenu')
    .addItem('学年を1つ上げる（4月）', 'promoteGradesMenu')
    .addItem('入口QRを表示', 'showEntranceQr')
    .addSeparator()
    .addItem('初期設定・トリガー再設定', 'setup')
    .addToUi();
}

function judgeTodayMenu() {
  const n = judgeDate(ymd_(new Date()));
  SpreadsheetApp.getActive().toast(`${n}人分を判定しました`, '出席管理');
}

function judgeDateMenu() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('判定する日付', '例：2026-12-01', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const ymd = toYmd_(res.getResponseText());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) { ui.alert('日付の形式が正しくありません'); return; }
  const n = judgeDate(ymd);
  SpreadsheetApp.getActive().toast(`${ymd}：${n}人分を判定しました`, '出席管理');
}

/* ========== 初期設定 ========== */

function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TZ);

  // 古い名前のシートを新しい名前に変える
  const oldTasks = ss.getSheetByName('×の割り当て');
  if (oldTasks && !ss.getSheetByName(SHEET.TASKS)) oldTasks.setName(SHEET.TASKS);

  // 見出しは毎回書き直す（列を追加したときも反映される）
  Object.keys(HEADERS).forEach(name => {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]])
      .setFontWeight('bold').setBackground('#e6eee8');
    sh.setFrozenRows(1);
  });

  // 日付・時刻・学生番号は文字列として扱う（自動変換を防ぐ）
  textColumns_(SHEET.RULES, [4, 5]);
  textColumns_(SHEET.MEMBERS, [1, 5, 8]);
  textColumns_(SHEET.KOMA, [1, 9]);
  textColumns_(SHEET.EXCEPTIONS, [1, 2, 5]);
  textColumns_(SHEET.PENALTY, [PC.ID, PC.DATE, PC.SID, PC.DONE_AT, PC.AUTO]);
  textColumns_(SHEET.TASKS, [TC.ID, TC.PID, TC.PDATE, TC.SID, TC.AT, TC.DONE_AT]);
  sheet_(SHEET.TASKS).getRange(2, TC.DONE, 2000, 1).insertCheckboxes();
  [PC.BASE, PC.DAYS, PC.COUNT, PC.PAID].forEach(c => {
    const sh = sheet_(SHEET.PENALTY);
    sh.getRange(2, c, sh.getMaxRows() - 1, 1).setNumberFormat('0');
  });
  textColumns_(SHEET.LOG, [1, 2, 3, 4]);
  textColumns_(SHEET.PRESENCE, [2, 3]);
  textColumns_(SHEET.ATTENDANCE, [1, 3, 6, 7, 8]);

  const st = sheet_(SHEET.SETTINGS);
  if (st.getLastRow() === 1) {
    DEFAULT_SETTINGS.forEach((row, i) => {
      const r = i + 2;
      st.getRange(r, 1).setValue(row[0]);
      st.getRange(r, 3).setValue(row[2]);
      const cell = st.getRange(r, 2);
      if (typeof row[1] === 'boolean') {
        cell.insertCheckboxes().setValue(row[1]);
      } else {
        cell.setNumberFormat('@').setValue(String(row[1]));
      }
    });
    st.setColumnWidth(1, 200); st.setColumnWidth(2, 260); st.setColumnWidth(3, 460);
  } else {
    // あとから増えた設定項目を足す
    const have = st.getRange(2, 1, st.getLastRow() - 1, 1).getValues().map(r => String(r[0]).trim());
    DEFAULT_SETTINGS.filter(row => have.indexOf(row[0]) < 0).forEach(row => {
      const r = st.getLastRow() + 1;
      st.getRange(r, 1).setValue(row[0]);
      st.getRange(r, 3).setValue(row[2]);
      const cell = st.getRange(r, 2);
      if (typeof row[1] === 'boolean') cell.insertCheckboxes().setValue(row[1]);
      else cell.setNumberFormat('@').setValue(String(row[1]));
    });
  }
  // 入口QRの中身を自動生成
  const settingRows = st.getRange(2, 1, st.getLastRow() - 1, 2).getValues();
  settingRows.forEach((r, i) => {
    if (r[0] === '入口QR' && !String(r[1]).trim()) {
      st.getRange(i + 2, 2).setNumberFormat('@')
        .setValue('KYUDO-DOJO:' + Utilities.getUuid().replace(/-/g, '').slice(0, 16));
    }
  });

  const rules = sheet_(SHEET.RULES);
  if (rules.getLastRow() === 1) {
    rules.getRange(2, 1, DEFAULT_RULES.length, 5).setValues(DEFAULT_RULES);
  }
  rules.getRange(2, 2, 200, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(RULE_CONDITIONS, true).build());

  migrateMemberStatus_();
  sheet_(SHEET.MEMBERS).getRange(2, 4, 300, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build());
  textColumns_(SHEET.MEMBERS, [11]);
  sheet_(SHEET.MEMBERS).getRange(2, 7, 300, 1).insertCheckboxes();
  sheet_(SHEET.MEMBERS).getRange(2, 9, 300, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(GENDERS, true).build());
  sheet_(SHEET.KOMA).getRange(2, 3, 300, 6).insertCheckboxes();
  sheet_(SHEET.EXCEPTIONS).getRange(2, 3, 1000, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(EXCEPTION_TYPES, true).build());
  sheet_(SHEET.MEMBERS).getRange(2, 10, 300, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(ROLES, true).build());
  sheet_(SHEET.ATTENDANCE).getRange(2, 12, 3000, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(JUDGEMENTS, true).build());

  const pt = sheet_(SHEET.PTYPES);
  if (pt.getLastRow() === 1) pt.getRange(2, 1, DEFAULT_PTYPES.length, 4).setValues(DEFAULT_PTYPES);
  setupPenaltyStats_();

  // 不要な初期シート・使わなくなった空のシートを削除
  ['シート1', 'Sheet1', '消化記録'].forEach(n => {
    const sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() <= 1 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });

  installTriggers_();
  try {
    SpreadsheetApp.getUi().alert('初期設定が完了しました。README の手順の続き（ウェブアプリのデプロイ）に進んでください。');
  } catch (e) {
    // Apps Script エディタから実行したときはダイアログを出せないので、ログに残す
    console.log('初期設定が完了しました');
  }
}

/** 旧「休部・退部」チェック列を「状態」列（現役／引退／休部・退部／卒業）に置き換える */
function migrateMemberStatus_() {
  const sh = sheet_(SHEET.MEMBERS);
  const ids = sh.getRange(2, 1, 300, 1).getValues();
  const range = sh.getRange(2, 4, 300, 1);
  const vals = range.getValues();
  range.clearDataValidations();
  const out = vals.map((r, i) => {
    if (!String(ids[i][0]).trim()) return ['']; // 空き行は空欄のまま
    const v = r[0];
    if (v === true || String(v).toUpperCase() === 'TRUE') return ['休部・退部'];
    if (v === false || String(v).toUpperCase() === 'FALSE' || !String(v).trim()) return ['現役'];
    return [String(v).trim()];
  });
  range.setValues(out);
}

function textColumns_(name, cols) {
  const sh = sheet_(name);
  cols.forEach(c => sh.getRange(2, c, sh.getMaxRows() - 1, 1).setNumberFormat('@'));
}

function installTriggers_() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'nightlyJob')
    .forEach(t => ScriptApp.deleteTrigger(t));
  // トリガーは指定時刻の前後15分にずれるので、15分遅らせて設定する
  const base = toSec_((toHHmm_(getSettings_()['自動退室の時刻']) || '22:00') + ':00') / 60 + 15;
  const h = Math.floor(base / 60) % 24;
  const m = base % 60;
  ScriptApp.newTrigger('nightlyJob').timeBased()
    .atHour(h).nearMinute(m).everyDays(1).inTimezone(TZ).create();
}

/* ========== ウェブアプリ（打刻アプリからの通信） ========== */

function doGet() {
  return ContentService.createTextOutput('ok');
}

function doPost(e) {
  let res;
  try {
    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const member = p.action === 'register' ? null : findMemberByKey_(p.key);
    if (p.action === 'register') {
      res = handleRegister_(p);
    } else if (!member) {
      res = { ok: false, code: 'unregistered', error: 'この端末は登録されていません。登録し直してください。' };
    } else if (!member.active) {
      res = { ok: false, error: `${member.status}のため打刻できません。主将に確認してください。` };
    } else if (!member.approved && (p.action === 'scan' || p.action === 'undo')) {
      res = { ok: false, error: '主将の承認待ちです。承認されると打刻できるようになります。' };
    } else {
      switch (p.action) {
        case 'status': res = handleStatus_(member); break;
        case 'scan': res = handleScan_(member, p); break;
        case 'undo':
          res = handleUndo_(member, p);
          // 入室を取り消したら、遅刻でついた罰も外れるように判定し直す
          if (res.ok && res.rejudge) { try { judgeDate(ymd_(new Date())); } catch (err) { console.log(err); } }
          break;
        case 'setKoma': res = handleSetKoma_(member, p); break;
        case 'addPenalty': res = handleAddPenalty_(member, p); break;
        case 'assignTask': res = handleAssignTask_(member, p); break;
        case 'editTask': res = handleEditTask_(member, p); break;
        case 'completeTask': res = handleCompleteTask_(member, p); break;
        case 'join': res = handleJoin_(member, p, true); break;
        case 'unjoin': res = handleJoin_(member, p, false); break;
        default: res = { ok: false, error: '不明な操作です' };
      }
    }
  } catch (err) {
    res = { ok: false, error: 'エラーが発生しました：' + err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(res))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleStatus_(member) {
  const now = new Date();
  const ymd = ymd_(now);
  const logs = logs_(ymd, true);
  const st = memberState_(logs, member.id);
  const plan = resolvePlan_(ctx_(ymd), member, ymd);
  const s = getSettings_();
  const officer = isOfficer_(member);
  return {
    ok: true,
    name: member.name,
    studentId: member.id,
    role: member.role || '部員',
    officer,
    penalties: listPenalties_(),
    penaltyTypes: officer ? penaltyTypes_().filter(t => t.how !== '自動').map(t => ({ reason: t.reason, base: t.base })) : [],
    taskSuggestions: officer ? taskSuggestions_() : [],
    members: officer ? members_().filter(m => m.active && m.approved).map(m => ({ id: m.id, name: m.name })) : [],
    approved: member.approved,
    inRoom: st.inRoom,
    since: st.inRoom ? st.last.time.slice(0, 5) : null,
    presence: presence_(logs),
    koma: komaMap_()[member.id] || null,
    komaLocked: isTrue_(s['コマ表ロック']),
    today: plan && !plan.off && isJudgedOn_(member, ymd, plan)
      ? { part: plan.part, deadline: plan.deadline, start: plan.start } : null,
    retired: isRetiredOn_(member, ymd),
    joins: isRetiredOn_(member, ymd) ? upcomingJoins_(member) : [],
  };
}

function handleScan_(member, p) {
  const s = getSettings_();
  if (String(p.qr || '').trim() !== String(s['入口QR'] || '').trim()) {
    return { ok: false, error: '道場の入口QRではありません。' };
  }

  let dist = '';
  const lat0 = parseFloat(s['道場の緯度']);
  const lng0 = parseFloat(s['道場の経度']);
  if (!isNaN(lat0) && !isNaN(lng0)) {
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') {
      return { ok: false, error: '位置情報を取得できませんでした。位置情報の利用を許可して、もう一度読み取ってください。' };
    }
    dist = Math.round(distanceM_(lat0, lng0, p.lat, p.lng));
    const allow = Number(s['許容距離(m)']) || 150;
    const acc = Math.min(Number(p.acc) || 0, 200);
    if (dist - acc > allow) {
      return { ok: false, error: `道場から離れすぎています（約${dist}m）。道場で読み取ってください。` };
    }
  }

  const res = scanLocked_(member, s, dist);
  // 遅刻ならその場で判定し直し、罰一覧に反映する（夜の自動判定を待たない）
  if (res.ok && res.late > 0) {
    try { judgeDate(ymd_(new Date())); res.penaltyAdded = true; } catch (err) { console.log(err); }
  }
  return res;
}

function scanLocked_(member, s, dist) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const now = new Date();
    const ymd = ymd_(now);
    const time = hms_(now);
    const logs = logs_(ymd, true);
    const st = memberState_(logs, member.id);

    const debounce = Number(s['二重読み取りを無視する秒数']) || 0;
    if (st.last && toSec_(time) - toSec_(st.last.time) < debounce) {
      return {
        ok: true, duplicate: true, type: st.last.type, time: st.last.time.slice(0, 5),
        name: member.name, judge: '', message: '直前に記録済みのため、今回の読み取りは無視しました',
      };
    }

    const type = st.inRoom ? TYPE_OUT : TYPE_IN;
    const firstInToday = type === TYPE_IN &&
      !logs.some(l => l.memberId === member.id && l.type === TYPE_IN);
    const id = appendLog_(member, type, `${ymd} ${time}`, dist, 'アプリ');

    let judge = '';
    let late = 0;
    if (firstInToday) {
      const plan = resolvePlan_(ctx_(ymd), member, ymd);
      if (plan && !plan.off && !isJudgedOn_(member, ymd, plan)) {
        judge = '引退後の参加（参加登録なし・判定なし）';
      } else if (plan && !plan.off) {
        late = lateMinutes_(plan.deadline, time);
        judge = late > 0
          ? `遅刻 ${late}分（${plan.part}・${plan.deadline}基準）`
          : `時間内（${plan.part}・${plan.deadline}基準）`;
      }
    }

    logs.push({ id, memberId: member.id, name: member.name, type, time, canceled: false });
    refreshPresenceSheet_(presence_(logs));
    return {
      ok: true, id, type, time: time.slice(0, 5), name: member.name, judge, late,
      undoSeconds: Number(s['取り消しできる秒数']) || 60,
    };
  } finally {
    lock.releaseLock();
  }
}

function handleUndo_(member, p) {
  const s = getSettings_();
  const limit = Number(s['取り消しできる秒数']) || 60;
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = sheet_(SHEET.LOG);
    const n = sh.getLastRow();
    if (n < 2) return { ok: false, error: '取り消せる記録がありません' };
    const start = Math.max(2, n - 500);
    const vals = sh.getRange(start, 1, n - start + 1, 9).getValues();
    for (let i = vals.length - 1; i >= 0; i--) {
      const r = vals[i];
      if (String(r[0]) !== String(p.id)) continue;
      if (String(r[3]).trim() !== member.id) return { ok: false, error: '自分の記録ではありません' };
      if (String(r[6]).trim()) return { ok: false, error: 'すでに取り消されています' };
      const at = parseDateTime_(toDateTimeStr_(r[1]));
      if ((Date.now() - at.getTime()) / 1000 > limit) {
        return { ok: false, error: '取り消せる時間を過ぎました。主将に修正を依頼してください。' };
      }
      sh.getRange(start + i, 7).setValue('取消');
      refreshPresenceSheet_(presence_(logs_(ymd_(new Date()), true)));
      return { ok: true, rejudge: String(r[5]).trim() === TYPE_IN };
    }
    return { ok: false, error: '記録が見つかりません' };
  } finally {
    lock.releaseLock();
  }
}

/** アプリからの部員登録。主将が部員名簿の「承認」にチェックするまで打刻はできない */
function handleRegister_(p) {
  const id = String(p.studentId || '').replace(/\s/g, '').toUpperCase();
  const name = String(p.name || '').trim().replace(/\s+/g, ' ');
  const grade = String(p.grade || '').trim();
  const gender = String(p.gender || '').trim();
  if (!/^[A-Z0-9]{4,12}$/.test(id)) return { ok: false, error: '学生番号を英数字で正しく入力してください。' };
  if (!name || name.length > 30) return { ok: false, error: '名前を入力してください。' };
  if (GENDERS.indexOf(gender) < 0) return { ok: false, error: '性別を選んでください。' };

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = sheet_(SHEET.MEMBERS);
    const n = sh.getLastRow();
    const vals = n > 1 ? sh.getRange(2, 1, n - 1, 9).getValues() : [];
    const key = Utilities.getUuid().replace(/-/g, '');
    const now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
    const found = vals.findIndex(r => String(r[0]).trim().toUpperCase() === id);

    if (found >= 0) {
      if (String(vals[found][4]).trim()) {
        return { ok: false, error: 'この学生番号はすでに登録されています。スマホを替えたなどで登録し直したいときは、主将に連絡してください。' };
      }
      // 主将が識別キーを消した行（再登録）や、先に名簿へ入れてあった行を引き継ぐ。承認はやり直し
      const r = found + 2;
      sh.getRange(r, 5).setNumberFormat('@').setValue(key);
      sh.getRange(r, 7).insertCheckboxes().setValue(false);
      sh.getRange(r, 8).setNumberFormat('@').setValue(now);
      if (!String(vals[found][8]).trim()) sh.getRange(r, 9).setValue(gender);
      return { ok: true, key, name: String(vals[found][1]).trim() || name };
    }

    const blank = vals.findIndex(r => !String(r[0]).trim());
    const r = blank >= 0 ? blank + 2 : n + 1;
    sh.getRange(r, 1).setNumberFormat('@').setValue(id);
    sh.getRange(r, 2, 1, 2).setValues([[name, grade]]);
    sh.getRange(r, 4).setValue('現役');
    sh.getRange(r, 5).setNumberFormat('@').setValue(key);
    sh.getRange(r, 6).setValue('');
    sh.getRange(r, 7).insertCheckboxes().setValue(false);
    sh.getRange(r, 8).setNumberFormat('@').setValue(now);
    sh.getRange(r, 9).setValue(gender);
    return { ok: true, key, name };
  } finally {
    lock.releaseLock();
  }
}

function handleSetKoma_(member, p) {
  if (isTrue_(getSettings_()['コマ表ロック'])) {
    return { ok: false, error: 'コマ表は確定済みです。変更は主将に連絡してください。' };
  }
  const k = p.koma || {};
  const row = [member.id, member.name].concat(KOMA_KEYS.map(key => k[key] === true))
    .concat([Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm')]);
  const sh = sheet_(SHEET.KOMA);
  const n = sh.getLastRow();
  const ids = n > 1 ? sh.getRange(2, 1, n - 1, 1).getValues().map(r => String(r[0]).trim()) : [];
  // チェックボックスだけの空行があるので、自分の行がなければ最初の空行に書く
  let idx = ids.indexOf(member.id);
  if (idx < 0) idx = ids.indexOf('');
  const r = idx >= 0 ? idx + 2 : n + 1;
  sh.getRange(r, 1, 1, row.length).setValues([row]);
  sh.getRange(r, 3, 1, 6).insertCheckboxes();
  sh.getRange(r, 3, 1, 6).setValues([row.slice(2, 8)]);
  return { ok: true, koma: komaMap_()[member.id] };
}

/* ========== 夜の自動処理 ========== */

function nightlyJob() {
  autoCheckout_();
  judgeDate(ymd_(new Date()));
  refreshPenalties_();
}

/** 罰一覧の経過日数・残りの数を今日の時点で計算し直す */
function refreshPenalties_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    writePenalties_(readPenalties_());
  } finally {
    lock.releaseLock();
  }
}

function autoCheckout_() {
  const s = getSettings_();
  const ymd = ymd_(new Date());
  const t = (toHHmm_(s['自動退室の時刻']) || '22:00') + ':00';
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    presence_(logs_(ymd, true)).forEach(p => {
      appendLog_({ id: p.id, name: p.name }, TYPE_AUTO_OUT, `${ymd} ${t}`, '', '自動');
    });
    refreshPresenceSheet_([]);
  } finally {
    lock.releaseLock();
  }
}

/* ========== 出欠判定 ========== */

function judgeDate(ymd) {
  const ctx = ctx_(ymd);
  const day = dayName_(ymd);
  const logs = logs_(ymd, false).filter(l => !l.canceled);
  const now = new Date();
  const isToday = ymd === ymd_(now);
  const nowSec = toSec_(hms_(now));
  const settings = getSettings_();
  const autoOutSec = toSec_((toHHmm_(settings['自動退室の時刻']) || '22:00') + ':00');
  const leadMin = Number(settings['連絡の締め切り（集合の何分前）']) || 60;
  const manual = readManualJudgements_(ymd);

  const results = [];
  members_().filter(m => m.active && m.approved).forEach(m => {
    const plan = resolvePlan_(ctx, m, ymd);
    if (!plan) return; // 練習日ではない

    const mine = logs.filter(l => l.memberId === m.id);
    const judged = isJudgedOn_(m, ymd, plan);
    if (!judged && !mine.length) return; // 引退した人が参加登録せず、来てもいない日は載せない
    const ins = mine.filter(l => l.type === TYPE_IN);
    const outs = mine.filter(l => l.type !== TYPE_IN);
    const firstIn = ins.length ? ins[0].time : '';
    const lastOut = outs.length ? outs[outs.length - 1].time : '';

    let total = 0;
    let openAt = null;
    mine.forEach(l => {
      if (l.type === TYPE_IN) {
        if (openAt === null) openAt = toSec_(l.time);
      } else if (openAt !== null) {
        total += toSec_(l.time) - openAt;
        openAt = null;
      }
    });
    if (openAt !== null && isToday) total += Math.max(0, nowSec - openAt);

    const notes = plan.notes.slice();
    let auto;
    let late = '';
    if (plan.off) {
      auto = '対象外';
    } else if (!judged) {
      auto = '参加（登録なし）';
      notes.push('引退後。参加登録がないので判定しない');
    } else if (firstIn) {
      const l = lateMinutes_(plan.deadline, firstIn);
      if (l > 0) {
        late = l;
        const notice = plan.lateNotice || plan.absentNotice;
        if (!notice) auto = '遅刻';
        else auto = noticeOnTime_(ymd, plan.deadline, notice, leadMin, notes) ? '遅刻（連絡済）' : '遅刻（連絡遅れ）';
      } else {
        auto = '出席';
      }
    } else if (plan.absentNotice || plan.lateNotice) {
      const notice = plan.absentNotice || plan.lateNotice;
      if (!plan.absentNotice && isToday && nowSec < autoOutSec) auto = '未到着';
      else auto = noticeOnTime_(ymd, plan.deadline, notice, leadMin, notes) ? '欠席（連絡済）' : '欠席（連絡遅れ）';
    } else {
      auto = isToday && nowSec < autoOutSec ? '未到着' : '無断欠席';
    }
    if (mine.some(l => l.type === TYPE_AUTO_OUT)) notes.push('退室打刻なし');

    const man = manual[m.id] || ['', ''];
    results.push([ymd, day, m.id, m.name, plan.part, plan.deadline, firstIn, lastOut,
      Math.round(total / 60), auto, late, man[0], man[1], '', notes.join(' / ')]);
  });

  writeAttendance_(ymd, results);

  // 最終判定（手動判定があればそちら）から、自動でつく罰を決める
  const desired = [];
  results.forEach(r => {
    const final = String(r[11] || r[9]).trim();
    if (AUTO_PENALTY_REASONS.indexOf(final) >= 0) desired.push({ id: r[2], name: r[3], reason: final });
  });
  syncAutoPenalties_(ymd, desired);
  return results.length;
}

/** 連絡の時刻が締め切り（集合の◯分前）までなら true。連絡日時が空欄なら締め切り内として扱う */
function noticeOnTime_(ymd, deadline, notice, leadMin, notes) {
  const raw = String(notice.contactAt || '').trim();
  if (!raw) { notes.push('連絡日時が未入力（締め切り内として扱った）'); return true; }
  let s = raw.replace(/\//g, '-');
  if (/^\d{1,2}:\d{2}$/.test(s)) s = `${ymd} ${s}`;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/);
  if (!m) { notes.push(`連絡日時を読めない：${raw}`); return true; }
  const at = parseDateTime_(`${m[1]}-${pad2_(m[2])}-${pad2_(m[3])} ${pad2_(m[4])}:${m[5]}:00`);
  const limit = parseDateTime_(`${ymd} ${deadline}:00`).getTime() - leadMin * 60000;
  return at.getTime() <= limit;
}

/** その日のその人の区分・遅刻基準を決める。練習日でなければ null */
function resolvePlan_(ctx, member, ymd) {
  const day = dayName_(ymd);
  const rules = ctx.rules[day];
  if (!rules || !rules.length) return null;
  if (ctx.exceptions.some(e => !e.id && e.type === '休み')) return null;

  const mine = ctx.exceptions.filter(e => e.id === member.id);
  const allEx = ctx.exceptions.filter(e => !e.id);
  const notes = [];
  let rule = rules.find(r => r.cond === '全員');

  if (!rule) {
    const k = ctx.koma[member.id];
    let k4 = k ? k[day + '4'] === true : false;
    let k5 = k ? k[day + '5'] === true : false;
    if (!k) notes.push('コマ表未登録');
    const komaEx = allEx.concat(mine)
      .filter(e => ['4・5コマなし', '4コマあり', '5コマあり'].indexOf(e.type) >= 0)
      .sort((a, b) => (a.type === '4・5コマなし' ? -1 : 0) - (b.type === '4・5コマなし' ? -1 : 0));
    komaEx.forEach(e => {
      if (e.type === '4・5コマなし') { k4 = false; k5 = false; }
      if (e.type === '4コマあり') k4 = true;
      if (e.type === '5コマあり') k5 = true;
    });
    if (komaEx.length) notes.push('臨時変更あり');
    const cond = k5 ? '5コマあり' : k4 ? '4コマあり' : '4・5コマなし';
    rule = rules.find(r => r.cond === cond);
  }
  if (!rule) return null;

  const memos = mine.filter(e => e.memo).map(e => `${e.type}：${e.memo}`);
  return {
    part: rule.part,
    deadline: rule.deadline,
    start: rule.start,
    off: mine.some(e => e.type === '休み'),
    absentNotice: mine.find(e => e.type === '欠席連絡済') || null,
    lateNotice: mine.find(e => e.type === '遅刻連絡済') || null,
    join: mine.find(e => e.type === '参加') || null,
    notes: notes.concat(memos),
  };
}

function writeAttendance_(ymd, newRows) {
  const sh = sheet_(SHEET.ATTENDANCE);
  const W = HEADERS[SHEET.ATTENDANCE].length;
  const n = sh.getLastRow();
  const old = n > 1 ? sh.getRange(2, 1, n - 1, W).getValues() : [];

  // 手動判定・修正理由は再判定しても残す
  const manual = {};
  const kept = [];
  old.forEach(r => {
    const d = toYmd_(r[0]);
    if (d === ymd) {
      manual[String(r[2]).trim()] = [r[11], r[12]];
    } else if (d) {
      r[0] = d;
      kept.push(r);
    }
  });
  newRows.forEach(r => {
    const m = manual[r[2]];
    if (m) { r[11] = m[0]; r[12] = m[1]; }
  });

  const partOrder = { '前半': 0, '全体': 1, '後半': 2 };
  const all = kept.concat(newRows).sort((a, b) => {
    if (a[0] !== b[0]) return a[0] < b[0] ? 1 : -1; // 新しい日付が上
    const pa = partOrder[a[4]] ?? 9, pb = partOrder[b[4]] ?? 9;
    if (pa !== pb) return pa - pb;
    return String(a[2]).localeCompare(String(b[2]));
  });
  all.forEach((r, i) => {
    const row = i + 2;
    r[13] = `=IF(L${row}<>"",L${row},J${row})`;
  });

  if (n > 1) sh.getRange(2, 1, n - 1, W).clearContent();
  if (all.length) sh.getRange(2, 1, all.length, W).setValues(all);
}

function readManualJudgements_(ymd) {
  const map = {};
  rows_(SHEET.ATTENDANCE).forEach(r => {
    if (toYmd_(r[0]) === ymd) map[String(r[2]).trim()] = [r[11], r[12]];
  });
  return map;
}

/* ========== 罰 ========== */

function penaltyTypes_() {
  return rows_(SHEET.PTYPES)
    .filter(r => String(r[0]).trim())
    .map(r => ({ reason: String(r[0]).trim(), base: Number(r[1]) || 1, how: String(r[2] || '').trim() }));
}

function baseOf_(reason) {
  const t = penaltyTypes_().find(x => x.reason === reason);
  return t ? t.base : 1;
}

function isOfficer_(member) {
  return OFFICER_ROLES.indexOf(member.role) >= 0;
}

/** 罰一覧の1行ぶんの値 */
function penaltyRow_(v, c) {
  return [v.id, v.date, v.sid, v.name, v.reason, v.base, c.days, c.remaining, v.done === true,
    v.doneAt || '', v.by || '', v.memo || '', v.auto || '', c.paid];
}

/** 罰の割り当て（やること）を読む */
function readTasks_() {
  return rows_(SHEET.TASKS).filter(r => String(r[TC.ID - 1]).trim()).map((r, i) => ({
    row: i + 2,
    id: String(r[TC.ID - 1]).trim(),
    pid: String(r[TC.PID - 1]).trim(),
    content: String(r[TC.CONTENT - 1] || '').trim(),
    at: toYmd_(r[TC.AT - 1]),
    by: String(r[TC.BY - 1] || ''),
    done: isTrue_(r[TC.DONE - 1]),
    doneAt: toYmd_(r[TC.DONE_AT - 1]),
  }));
}

/** 消化済みのやること1つ＝罰1個の消化。罰IDごとに、消化した日と数の一覧にする */
function readSettlements_() {
  const map = {};
  readTasks_().filter(t => t.done).forEach(t => {
    (map[t.pid] = map[t.pid] || []).push({ date: t.doneAt || ymd_(new Date()), count: 1, content: t.content });
  });
  return map;
}

function tasksByPenalty_() {
  const map = {};
  readTasks_().forEach(t => { (map[t.pid] = map[t.pid] || []).push(t); });
  return map;
}

function appendTasks_(penalty, contents, by) {
  if (!contents.length) return;
  const sh = sheet_(SHEET.TASKS);
  const r = sh.getLastRow() + 1;
  const today = ymd_(new Date());
  sh.getRange(r, 1, contents.length, TC.DONE_BY).setNumberFormat('@');
  sh.getRange(r, 1, contents.length, TC.DONE_BY).setValues(contents.map(c => [
    'T' + Utilities.getUuid().replace(/-/g, '').slice(0, 8), penalty.id, penalty.date, penalty.sid, penalty.name,
    penalty.reason, c, today, by, '', '', '',
  ]));
  sh.getRange(r, TC.DONE, contents.length, 1).insertCheckboxes();
}

function cleanContent_(v) {
  return String(v || '').trim().replace(/\s+/g, ' ').slice(0, 60);
}

/**
 * 罰の残りの数を計算する。
 * 残っている数だけが、ついた日から「倍になる日数」ごとに2倍になる。
 * 倍になる日の前日までに消化した分は、倍になる前に差し引く。
 */
function computePenalty_(p, settles, today, every) {
  const list = (settles || []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const end = p.done && p.doneAt ? p.doneAt : today;
  const days = Math.max(0, daysBetween_(p.date, end));
  let remaining = p.base;
  let i = 0;
  const paidBefore = limitYmd => {
    while (i < list.length && list[i].date < limitYmd) { remaining -= list[i].count; i++; }
  };
  for (let k = 1; k <= Math.floor(days / every); k++) {
    paidBefore(addDays_(p.date, k * every));
    if (remaining <= 0) break;
    remaining *= 2;
  }
  paidBefore('9999-12-31');
  const paid = list.reduce((a, x) => a + x.count, 0);
  return { days, remaining: Math.max(0, remaining), paid, daysToDouble: every - (days % every), history: list };
}

function addDays_(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad2_(t.getUTCMonth() + 1)}-${pad2_(t.getUTCDate())}`;
}

function readPenalties_() {
  return rows_(SHEET.PENALTY).filter(r => String(r[PC.ID - 1]).trim()).map(r => ({
    id: String(r[PC.ID - 1]).trim(),
    date: toYmd_(r[PC.DATE - 1]),
    sid: String(r[PC.SID - 1]).trim(),
    name: String(r[PC.NAME - 1]).trim(),
    reason: String(r[PC.REASON - 1]).trim(),
    base: Number(r[PC.BASE - 1]) || 1,
    done: isTrue_(r[PC.DONE - 1]),
    doneAt: toYmd_(r[PC.DONE_AT - 1]),
    by: String(r[PC.BY - 1] || ''),
    memo: String(r[PC.MEMO - 1] || ''),
    auto: String(r[PC.AUTO - 1] || '').trim(),
  }));
}

/** 罰一覧を日付の古い順に並べて書き直す（記録は消さない） */
function writePenalties_(list) {
  const sh = sheet_(SHEET.PENALTY);
  const W = HEADERS[SHEET.PENALTY].length;
  list.sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : (a.date < b.date ? -1 : 1)));
  const n = sh.getLastRow();
  if (n > 1) sh.getRange(2, 1, n - 1, W).clearContent();
  if (!list.length) return;
  const settles = readSettlements_();
  const today = ymd_(new Date());
  const every = Number(getSettings_()['罰が倍になる日数']) || 7;
  sh.getRange(2, 1, list.length, W).setValues(list.map(v => penaltyRow_(v, computePenalty_(v, settles[v.id], today, every))));
  sh.getRange(2, PC.DONE, list.length, 1).insertCheckboxes();
  sh.getRange(2, PC.DONE, list.length, 1).setValues(list.map(v => [v.done === true]));
}

/**
 * 自動でつく罰（遅刻・無断欠席など）をその日の判定に合わせる。
 * 消化済みの罰と、副務が記録した罰には触らない。
 */
function syncAutoPenalties_(ymd, desired) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const list = readPenalties_();
    const tasks = tasksByPenalty_();
    const want = {};
    desired.forEach(d => { want[`auto|${ymd}|${d.id}`] = d; });
    const kept = list.filter(p => {
      // 消化済み・やることを割り当て済みの罰は、判定が変わっても残す（副務が見直す）
      if (!p.auto || p.date !== ymd || p.done || tasks[p.id]) return true;
      const d = want[p.auto];
      if (!d) return false; // 判定が変わって罰がなくなった
      p.reason = d.reason;
      p.base = baseOf_(d.reason);
      delete want[p.auto];
      return true;
    });
    Object.keys(want).forEach(k => {
      const d = want[k];
      if (list.some(p => p.auto === k && p.done)) return; // 消化済みが残っている
      kept.push({
        id: newPenaltyId_(), date: ymd, sid: d.id, name: d.name, reason: d.reason,
        base: baseOf_(d.reason), done: false, by: '自動', auto: k,
      });
    });
    writePenalties_(kept);
  } finally {
    lock.releaseLock();
  }
}

function newPenaltyId_() {
  return 'P' + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
}

/** アプリに出す未消化の罰（古い順）。現在の数と、次に倍になるまでの日数も計算する */
function listPenalties_() {
  const today = ymd_(new Date());
  const every = Number(getSettings_()['罰が倍になる日数']) || 7;
  const settles = readSettlements_();
  const tasks = tasksByPenalty_();
  return readPenalties_().filter(p => !p.done).map(p => {
    const c = computePenalty_(p, settles[p.id], today, every);
    const open = (tasks[p.id] || []).filter(t => !t.done).map(t => ({ id: t.id, content: t.content }));
    return {
      id: p.id, date: p.date, name: p.name, studentId: p.sid, reason: p.reason, memo: p.memo,
      count: c.remaining, paid: c.paid, daysToDouble: c.daysToDouble,
      tasks: open, unassigned: Math.max(0, c.remaining - open.length),
    };
  }).filter(p => p.count > 0).sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : (a.date < b.date ? -1 : 1)));
}

/** 副務・主将がアプリから罰を記録する（私物の出しっぱなしなど） */
function handleAddPenalty_(member, p) {
  if (!isOfficer_(member)) return { ok: false, error: '罰を記録できるのは副務と主将だけです。' };
  const target = members_().find(m => m.id === String(p.studentId || '').trim());
  if (!target) return { ok: false, error: '部員が見つかりません。' };
  const reason = String(p.reason || '').trim();
  const type = penaltyTypes_().find(t => t.reason === reason);
  if (!type) return { ok: false, error: '罰の理由を選んでください。' };
  const date = toYmd_(p.date || ymd_(new Date()));
  if (!date) return { ok: false, error: '日付が正しくありません。' };
  const memo = String(p.memo || '').trim().slice(0, 200);
  if (reason === 'その他' && !memo) return { ok: false, error: '「その他」のときはメモに内容を書いてください。' };
  const contents = (p.contents || []).map(cleanContent_).filter(Boolean);
  if (contents.length !== type.base) return { ok: false, error: `罰${type.base}個ぶんの「やること」をすべて入力してください。` };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const list = readPenalties_();
    const penalty = { id: newPenaltyId_(), date, sid: target.id, name: target.name, reason, base: type.base, done: false, by: member.name, memo };
    list.push(penalty);
    appendTasks_(penalty, contents, member.name);
    writePenalties_(list);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, penalties: listPenalties_(), taskSuggestions: taskSuggestions_() };
}

/** 副務・主将が、まだ割り当てていない罰に「やること」を割り当てる（遅刻などの自動の罰や、倍になって増えた分） */
function handleAssignTask_(member, p) {
  if (!isOfficer_(member)) return { ok: false, error: '割り当てができるのは副務と主将だけです。' };
  const content = cleanContent_(p.content);
  if (!content) return { ok: false, error: 'やることを入力してください。' };
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const penalty = readPenalties_().find(x => x.id === String(p.penaltyId || ''));
    if (!penalty || penalty.done) return { ok: false, error: '罰が見つかりません。' };
    const item = listPenalties_().find(x => x.id === penalty.id);
    if (!item || item.unassigned < 1) return { ok: false, error: 'この罰は、すべて割り当て済みです。' };
    appendTasks_(penalty, [content], member.name);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, penalties: listPenalties_(), taskSuggestions: taskSuggestions_() };
}

/** 割り当てたやることの内容を直す */
function handleEditTask_(member, p) {
  if (!isOfficer_(member)) return { ok: false, error: '変更できるのは副務と主将だけです。' };
  const content = cleanContent_(p.content);
  if (!content) return { ok: false, error: 'やることを入力してください。' };
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = readTasks_().find(x => x.id === String(p.taskId || ''));
    if (!t || t.done) return { ok: false, error: 'やることが見つかりません。' };
    sheet_(SHEET.TASKS).getRange(t.row, TC.CONTENT).setValue(content);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, penalties: listPenalties_(), taskSuggestions: taskSuggestions_() };
}

/** 副務・主将が、終わった証拠を確認して、やることを消す（罰1個の消化） */
function handleCompleteTask_(member, p) {
  if (!isOfficer_(member)) return { ok: false, error: '消化を確認できるのは副務と主将だけです。' };
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = readTasks_().find(x => x.id === String(p.taskId || ''));
    if (!t) return { ok: false, error: 'やることが見つかりません。' };
    if (t.done) return { ok: false, error: 'すでに消化済みです。' };
    const today = ymd_(new Date());
    const sh = sheet_(SHEET.TASKS);
    sh.getRange(t.row, TC.DONE).setValue(true);
    sh.getRange(t.row, TC.DONE_AT).setNumberFormat('@').setValue(today);
    sh.getRange(t.row, TC.DONE_BY).setValue(member.name);

    // 残りが0になったら、罰を消化済みにする
    const list = readPenalties_();
    const penalty = list.find(x => x.id === t.pid);
    if (penalty && !penalty.done) {
      const every = Number(getSettings_()['罰が倍になる日数']) || 7;
      const c = computePenalty_(penalty, readSettlements_()[penalty.id], today, every);
      if (c.remaining <= 0) { penalty.done = true; penalty.doneAt = today; }
    }
    writePenalties_(list);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, penalties: listPenalties_() };
}

/** これまでに割り当てた「やること」（新しい順・重複なし）。入力候補に使う */
function taskSuggestions_() {
  const seen = {};
  const out = [];
  readTasks_().reverse().forEach(t => {
    if (t.content && !seen[t.content]) { seen[t.content] = true; out.push(t.content); }
  });
  return out.slice(0, 30);
}

/** シートで「消化済み」にチェックしたら消化日を入れる（副務がシートで操作する場合） */
function onEdit(e) {
  try {
    const sh = e.range.getSheet();
    if (sh.getName() !== SHEET.PENALTY || e.range.getColumn() !== PC.DONE || e.range.getRow() < 2) return;
    for (let i = 0; i < e.range.getNumRows(); i++) {
      const r = e.range.getRow() + i;
      const done = isTrue_(sh.getRange(r, PC.DONE).getValue());
      const at = sh.getRange(r, PC.DONE_AT);
      if (done && !String(at.getValue()).trim()) at.setNumberFormat('@').setValue(ymd_(new Date()));
      if (!done) at.setValue('');
    }
  } catch (err) {
    console.log(err);
  }
}

/** 罰の集計シート（部員ごとの件数・理由別・未消化の数）。記録が増えると自動で更新される */
function setupPenaltyStats_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET.PSTATS) || ss.insertSheet(SHEET.PSTATS);
  const P = `'${SHEET.PENALTY}'`;
  const M = `'${SHEET.MEMBERS}'`;
  const T = `'${SHEET.PTYPES}'`;
  sh.clear();
  sh.getRange(1, 1, 1, 5).setValues([['学生番号', '名前', '罰の件数（累計）', '未消化の件数', '残りの罰の数（今）']]);
  sh.getRange('F1').setFormula(`=TRANSPOSE(FILTER(${T}!A2:A,${T}!A2:A<>""))`);
  sh.getRange('A2').setFormula(`=IFERROR(SORT(UNIQUE(FILTER(${P}!C2:C,${P}!C2:C<>""))),"")`);
  sh.getRange('B2').setFormula(`=ARRAYFORMULA(IF(A2:A300="","",IFERROR(VLOOKUP(A2:A300,${M}!A:B,2,FALSE),"")))`);
  sh.getRange('C2').setFormula(`=ARRAYFORMULA(IF(A2:A300="","",COUNTIF(${P}!C2:C,A2:A300)))`);
  sh.getRange('D2').setFormula(`=ARRAYFORMULA(IF(A2:A300="","",COUNTIFS(${P}!C2:C,A2:A300,${P}!I2:I,FALSE)))`);
  sh.getRange('E2').setFormula(`=ARRAYFORMULA(IF(A2:A300="","",SUMIFS(${P}!H2:H,${P}!C2:C,A2:A300,${P}!I2:I,FALSE)))`);
  // 理由ごとの件数（F列から、罰の種類の数だけ）
  for (let c = 6; c <= 15; c++) {
    const col = sh.getRange(1, c).getA1Notation().replace(/\d+/g, '');
    sh.getRange(2, c).setFormula(
      `=IF(${col}$1="","",ARRAYFORMULA(IF($A$2:$A$300="","",COUNTIFS(${P}!$C$2:$C,$A$2:$A$300,${P}!$E$2:$E,${col}$1))))`);
  }
  sh.getRange(1, 1, 1, 15).setFontWeight('bold').setBackground('#e6eee8');
  sh.setFrozenRows(1);
}

function daysBetween_(fromYmd, toYmd) {
  const a = fromYmd.split('-').map(Number);
  const b = toYmd.split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}

/* ========== 引退した人の参加登録 ========== */

/** これから JOIN_DAYS_AHEAD 日の練習日と、参加登録の状態 */
function upcomingJoins_(member) {
  const rules = rulesByDay_();
  const koma = komaMap_();
  const exRows = rows_(SHEET.EXCEPTIONS);
  const leadMin = Number(getSettings_()['連絡の締め切り（集合の何分前）']) || 60;
  const now = new Date();
  const out = [];
  for (let i = 0; i <= JOIN_DAYS_AHEAD; i++) {
    const ymd = ymd_(new Date(now.getTime() + i * 86400000));
    const exceptions = exRows
      .filter(r => String(r[0]).trim() && toYmd_(r[0]) === ymd)
      .map(r => ({ id: String(r[1]).trim(), type: String(r[2]).trim(), memo: '', contactAt: '' }));
    const plan = resolvePlan_({ rules, koma, exceptions }, member, ymd);
    if (!plan || plan.off) continue;
    const start = parseDateTime_(`${ymd} ${plan.deadline}:00`).getTime();
    if (now.getTime() > start && !plan.join) continue; // 集合時刻を過ぎた日は登録できない
    out.push({
      date: ymd, day: dayName_(ymd), deadline: plan.deadline, part: plan.part,
      joined: !!plan.join,
      canJoin: now.getTime() <= start,
      canCancel: now.getTime() <= start - leadMin * 60000,
    });
  }
  return out;
}

/** 引退した人が参加を登録・取り消す。登録は集合時刻まで、取り消しは連絡の締め切りまで */
function handleJoin_(member, p, join) {
  const ymd = toYmd_(p.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return { ok: false, error: '日付が正しくありません。' };
  if (!isRetiredOn_(member, ymd)) return { ok: false, error: '参加の登録は引退した人だけが使います。' };
  const day = upcomingJoins_(member).find(d => d.date === ymd);
  if (!day) return { ok: false, error: 'この日は練習日ではないか、登録できる期間を過ぎています。' };

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = sheet_(SHEET.EXCEPTIONS);
    const n = sh.getLastRow();
    const vals = n > 1 ? sh.getRange(2, 1, n - 1, 3).getValues() : [];
    const idx = vals.findIndex(r => toYmd_(r[0]) === ymd && String(r[1]).trim() === member.id &&
      String(r[2]).trim() === '参加');
    if (join) {
      if (!day.canJoin) return { ok: false, error: '集合時刻を過ぎたので登録できません。' };
      if (idx < 0) {
        const r = n + 1;
        sh.getRange(r, 1, 1, 5).setNumberFormat('@');
        sh.getRange(r, 1, 1, 5).setValues([[ymd, member.id, '参加', `アプリから登録（${member.name}）`,
          Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm')]]);
      }
    } else {
      if (idx < 0) return { ok: true };
      if (!day.canCancel) {
        return { ok: false, error: '取り消しの締め切りを過ぎました。来られない場合は主将に欠席の連絡をしてください。' };
      }
      sh.deleteRow(idx + 2);
    }
  } finally {
    lock.releaseLock();
  }
  if (ymd === ymd_(new Date())) { try { judgeDate(ymd); } catch (err) { console.log(err); } }
  return { ok: true, joins: upcomingJoins_(member) };
}

/* ========== 代替わり・学年の繰り上げ ========== */

/** 指定した学年の現役部員を引退にし、主将・副務を新しい人に替える */
function changeGenerationMenu() {
  const ui = SpreadsheetApp.getUi();
  const g = ui.prompt('代替わり（1/3）', '引退する学年を入力してください（例：3年）', ui.ButtonSet.OK_CANCEL);
  if (g.getSelectedButton() !== ui.Button.OK) return;
  const grade = normalizeGrade_(g.getResponseText());
  const targets = members_().filter(m => m.status === '現役' && m.grade === grade);
  if (!targets.length) { ui.alert(`${grade}の現役部員がいません。`); return; }

  const cap = ui.prompt('代替わり（2/3）', '新しい主将の学生番号（空欄なら変更しない）', ui.ButtonSet.OK_CANCEL);
  if (cap.getSelectedButton() !== ui.Button.OK) return;
  const vice = ui.prompt('代替わり（3/3）', '新しい副務の学生番号（複数ならカンマ区切り。空欄なら変更しない）', ui.ButtonSet.OK_CANCEL);
  if (vice.getSelectedButton() !== ui.Button.OK) return;
  const ids = s => String(s || '').toUpperCase().split(/[,、\s]+/).map(x => x.trim()).filter(Boolean);
  const newCap = ids(cap.getResponseText());
  const newVice = ids(vice.getResponseText());
  const all = members_();
  const missing = newCap.concat(newVice).filter(id => !all.some(m => m.id === id));
  if (missing.length) { ui.alert(`名簿にない学生番号があります：${missing.join(', ')}`); return; }

  const ok = ui.alert('代替わりの確認',
    `${grade}の${targets.length}人（${targets.map(m => m.name).join('、')}）を今日付けで引退にします。\n` +
    (newCap.length ? `主将：${newCap.join(', ')}\n` : '') + (newVice.length ? `副務：${newVice.join(', ')}\n` : '') +
    '残っている罰はそのまま残ります。よろしいですか？', ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;

  const today = ymd_(new Date());
  const sh = sheet_(SHEET.MEMBERS);
  const n = sh.getLastRow();
  const vals = sh.getRange(2, 1, n - 1, 11).getValues();
  const targetIds = targets.map(m => m.id);
  vals.forEach((r, i) => {
    const id = String(r[0]).trim().toUpperCase();
    const row = i + 2;
    if (targetIds.indexOf(id) >= 0) {
      sh.getRange(row, 4).setValue('引退');
      sh.getRange(row, 11).setNumberFormat('@').setValue(today);
      if (OFFICER_ROLES.indexOf(String(r[9]).trim()) >= 0) sh.getRange(row, 10).setValue('部員');
    }
    const oldRole = String(r[9]).trim();
    if (newCap.length && oldRole === '主将' && newCap.indexOf(id) < 0) sh.getRange(row, 10).setValue('部員');
    if (newVice.length && oldRole === '副務' && newVice.indexOf(id) < 0) sh.getRange(row, 10).setValue('部員');
    if (newCap.indexOf(id) >= 0) sh.getRange(row, 10).setValue('主将');
    if (newVice.indexOf(id) >= 0) sh.getRange(row, 10).setValue('副務');
  });
  judgeDate(today);
  ui.alert(`${targets.length}人を引退にしました。引退した人は、アプリで「参加する」を登録した日だけ出欠を判定します。`);
}

/** 4月に学年を1つ上げる。4年・院2年は「卒業」にする（記録は残す） */
function promoteGradesMenu() {
  const ui = SpreadsheetApp.getUi();
  const sh = sheet_(SHEET.MEMBERS);
  const n = sh.getLastRow();
  if (n < 2) return;
  const vals = sh.getRange(2, 1, n - 1, 4).getValues();
  const plan = [];
  vals.forEach((r, i) => {
    if (!String(r[0]).trim()) return;
    const status = statusOf_(r[3]);
    if (status === '卒業' || status === '休部・退部') return;
    const grade = normalizeGrade_(r[2]);
    if (GRADUATING.indexOf(grade) >= 0) plan.push({ row: i + 2, grade, status: '卒業', name: r[1] });
    else if (GRADE_UP[grade]) plan.push({ row: i + 2, grade: GRADE_UP[grade], status, name: r[1] });
  });
  const grads = plan.filter(p => p.status === '卒業');
  const ok = ui.alert('学年を1つ上げる',
    `${plan.length - grads.length}人の学年を1つ上げ、${grads.length}人（${grads.map(p => p.name).join('、') || 'なし'}）を卒業にします。\n` +
    '現役・引退の状態は変わりません。大学院に進んで続ける人は、あとで学年と状態を直してください。\n\n' +
    '1年に1回だけ実行してください。よろしいですか？', ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  plan.forEach(p => {
    sh.getRange(p.row, 3).setValue(p.grade);
    sh.getRange(p.row, 4).setValue(p.status);
  });
  ui.alert('学年を更新しました。新入生はアプリから登録してもらい、承認してください。');
}

function normalizeGrade_(v) {
  const s = String(v || '').trim().replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  if (/^\d$/.test(s)) return s + '年';
  return s;
}

/* ========== 部員・コマ表・臨時変更・ルール ========== */

function members_() {
  return rows_(SHEET.MEMBERS)
    .filter(r => String(r[0]).trim())
    .map(r => ({
      id: String(r[0]).trim(),
      name: String(r[1]).trim(),
      grade: normalizeGrade_(r[2]),
      status: statusOf_(r[3]),
      active: ['現役', '引退'].indexOf(statusOf_(r[3])) >= 0,
      key: String(r[4]).trim(),
      approved: isTrue_(r[6]),
      role: String(r[9] || '').trim(),
      retiredAt: r[10] instanceof Date ? Utilities.formatDate(r[10], TZ, 'yyyy-MM-dd') : toYmd_(r[10] || ''),
    }));
}

function statusOf_(v) {
  if (v === true || String(v).toUpperCase() === 'TRUE') return '休部・退部';
  const s = String(v || '').trim();
  if (!s || s.toUpperCase() === 'FALSE') return '現役';
  return s;
}

/** その日、引退後の扱いか（引退日が空欄なら、引退にした時点から引退扱い） */
function isRetiredOn_(m, ymd) {
  if (m.status !== '引退') return false;
  return !m.retiredAt || m.retiredAt <= ymd;
}

/** その日、出欠を判定する人か。引退した人は「参加」を登録した日だけ */
function isJudgedOn_(m, ymd, plan) {
  return !isRetiredOn_(m, ymd) || !!(plan && plan.join);
}

function findMemberByKey_(key) {
  if (!key) return null;
  return members_().find(m => m.key && m.key === String(key).trim()) || null;
}

function komaMap_() {
  const map = {};
  rows_(SHEET.KOMA).forEach(r => {
    const id = String(r[0]).trim();
    if (!id) return;
    const k = {};
    KOMA_KEYS.forEach((key, i) => { k[key] = isTrue_(r[2 + i]); });
    map[id] = k;
  });
  return map;
}

function rulesByDay_() {
  const map = {};
  rows_(SHEET.RULES).forEach(r => {
    const d = String(r[0]).trim();
    if (!d) return;
    (map[d] = map[d] || []).push({
      cond: String(r[1]).trim(),
      part: String(r[2]).trim(),
      deadline: toHHmm_(r[3]),
      start: toHHmm_(r[4]),
    });
  });
  return map;
}

function exceptionsFor_(ymd) {
  return rows_(SHEET.EXCEPTIONS)
    .filter(r => String(r[0]).trim() && toYmd_(r[0]) === ymd)
    .map(r => ({
      id: String(r[1]).trim(), type: String(r[2]).trim(), memo: String(r[3] || '').trim(),
      contactAt: r[4] instanceof Date ? Utilities.formatDate(r[4], TZ, 'yyyy-MM-dd HH:mm') : String(r[4] || '').trim(),
    }));
}

function ctx_(ymd) {
  return { rules: rulesByDay_(), koma: komaMap_(), exceptions: exceptionsFor_(ymd) };
}

/* ========== 打刻ログ・在室 ========== */

function logs_(ymd, recentOnly) {
  const sh = sheet_(SHEET.LOG);
  const n = sh.getLastRow();
  if (n < 2) return [];
  const start = recentOnly ? Math.max(2, n - RECENT_LOG_ROWS + 1) : 2;
  const vals = sh.getRange(start, 1, n - start + 1, 9).getValues();
  const out = [];
  vals.forEach(r => {
    const dt = toDateTimeStr_(r[1]);
    if (dt.slice(0, 10) !== ymd) return;
    out.push({
      id: String(r[0]),
      time: dt.slice(11, 19),
      memberId: String(r[3]).trim(),
      name: String(r[4]),
      type: String(r[5]).trim(),
      canceled: String(r[6]).trim() !== '',
    });
  });
  return out.filter(l => !l.canceled);
}

function appendLog_(member, type, datetime, dist, via) {
  const id = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  const sh = sheet_(SHEET.LOG);
  const r = sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, 4).setNumberFormat('@');
  sh.getRange(r, 1, 1, 9).setValues([[id, datetime, datetime.slice(0, 10), member.id, member.name, type, '', dist, via]]);
  return id;
}

function memberState_(logs, memberId) {
  const mine = logs.filter(l => l.memberId === memberId && !l.canceled);
  const last = mine.length ? mine[mine.length - 1] : null;
  return { last, inRoom: !!last && last.type === TYPE_IN };
}

function presence_(logs) {
  const last = {};
  logs.filter(l => !l.canceled).forEach(l => { last[l.memberId] = l; });
  return Object.keys(last).map(k => last[k])
    .filter(l => l.type === TYPE_IN)
    .map(l => ({ id: l.memberId, name: l.name, since: l.time.slice(0, 5) }))
    .sort((a, b) => (a.since < b.since ? -1 : a.since > b.since ? 1 : 0));
}

function refreshPresenceSheet_(list) {
  const sh = sheet_(SHEET.PRESENCE);
  const n = sh.getLastRow();
  if (n > 1) sh.getRange(2, 1, n - 1, 3).clearContent();
  if (list.length) sh.getRange(2, 1, list.length, 3).setValues(list.map(p => [p.name, p.id, p.since]));
}

/* ========== 管理者向け ========== */

function issueKeys() {
  const ui = SpreadsheetApp.getUi();
  const sh = sheet_(SHEET.MEMBERS);
  const n = sh.getLastRow();
  if (n < 2) { ui.alert('部員名簿に部員を入力してください'); return; }
  const appUrl = String(getSettings_()['アプリURL'] || '').trim();
  const vals = sh.getRange(2, 1, n - 1, 6).getValues();
  let issued = 0;
  const out = vals.map(r => {
    if (!String(r[0]).trim()) return [r[4], r[5]];
    let key = String(r[4]).trim();
    if (!key) { key = Utilities.getUuid().replace(/-/g, ''); issued++; }
    const url = appUrl ? `${appUrl}${appUrl.indexOf('?') >= 0 ? '&' : '?'}key=${key}` : '';
    return [key, url];
  });
  sh.getRange(2, 5, n - 1, 2).setValues(out);
  ui.alert(`${issued}人分の識別キーを発行しました。` +
    (appUrl ? '' : '\n設定シートの「アプリURL」が空のため、登録URLは作成されていません。'));
}

function showEntranceQr() {
  const qr = String(getSettings_()['入口QR'] || '');
  const src = 'https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=20&data=' + encodeURIComponent(qr);
  const html = HtmlService.createHtmlOutput(
    `<div style="text-align:center;font-family:sans-serif">
       <img src="${src}" style="width:380px;height:380px">
       <p style="font-size:18px;font-weight:bold">弓道場 入退室</p>
       <p style="color:#666;font-size:12px">画像を保存して印刷し、入口に貼ってください</p>
     </div>`).setWidth(440).setHeight(520);
  SpreadsheetApp.getUi().showModalDialog(html, '入口QR');
}

/* ========== ユーティリティ ========== */

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error(`シート「${name}」がありません。メニューの「初期設定」を実行してください`);
  return sh;
}

function rows_(name) {
  const sh = sheet_(name);
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, Math.max(sh.getLastColumn(), 1)).getValues();
}

function getSettings_() {
  const map = {};
  rows_(SHEET.SETTINGS).forEach(r => { if (String(r[0]).trim()) map[String(r[0]).trim()] = r[1]; });
  return map;
}

function isTrue_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

function pad2_(v) {
  return ('0' + v).slice(-2);
}

function ymd_(d) {
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
}

function hms_(d) {
  return Utilities.formatDate(d, TZ, 'HH:mm:ss');
}

function toYmd_(v) {
  if (v instanceof Date) return ymd_(v);
  const m = String(v).trim().match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  return m ? `${m[1]}-${pad2_(m[2])}-${pad2_(m[3])}` : '';
}

function toHHmm_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'HH:mm');
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? `${pad2_(m[1])}:${m[2]}` : '';
}

function toDateTimeStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm:ss');
  return String(v).trim();
}

function parseDateTime_(s) {
  return new Date(s.replace(' ', 'T') + '+09:00');
}

function toSec_(hms) {
  const p = String(hms).split(':').map(Number);
  return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
}

/** 基準時刻（HH:mm）を1秒でも過ぎたら遅刻。遅刻分は切り上げ */
function lateMinutes_(deadline, time) {
  const diff = toSec_(time) - toSec_(deadline + ':00');
  return diff > 0 ? Math.ceil(diff / 60) : 0;
}

function dayName_(ymd) {
  const u = Number(Utilities.formatDate(parseDateTime_(ymd + ' 12:00:00'), TZ, 'u')); // 1=月 … 7=日
  return DAY_NAMES[u % 7];
}

function distanceM_(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = x => x * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
