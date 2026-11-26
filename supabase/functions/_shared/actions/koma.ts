import { KOMA_KEYS, toPracticeDate, type Koma } from '../../../../packages/core/src/index.ts';
import { requireEnrolledMember, type RequestContext } from '../context.ts';
import { inTransaction } from '../db.ts';
import { AppError } from '../errors.ts';
import { booleanParam, objectParam, type Params } from '../params.ts';
import { homeSnapshot, loadSettings } from '../store.ts';

export async function setKoma({ sql, userId, now }: RequestContext, params: Params) {
  const input = objectParam(params, 'koma');
  const koma = Object.fromEntries(KOMA_KEYS.map((key) => [key, booleanParam(input, key)])) as Koma;

  await inTransaction(sql, async (tx) => {
    const member = await requireEnrolledMember(tx, userId);
    if ((await loadSettings(tx)).komaLocked) {
      throw new AppError('コマ表は確定済みです。変更は主将に連絡してください。');
    }
    const row = { member_id: member.id, ...koma, updated_at: now };
    await tx`insert into public.koma ${tx(row)}
      on conflict (member_id) do update set ${tx(row, ...KOMA_KEYS, 'updated_at')}`;
  });
  return { home: await homeSnapshot(sql, userId, toPracticeDate(now)) };
}
