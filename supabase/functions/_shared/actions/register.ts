import { toPracticeDate, validateRegistration } from '../../../../packages/core/src/index.ts';
import { isAdmin, type RequestContext } from '../context.ts';
import { inTransaction } from '../db.ts';
import { AppError } from '../errors.ts';
import { stringParam, type Params } from '../params.ts';
import { homeSnapshot } from '../store.ts';

const ALREADY_USED =
  'この学生番号はすでに登録されています。スマホを替えたなどで登録し直したいときは、主将に連絡してください。';

/** アプリからの部員登録。主将が承認するまで打刻はできない。 */
export async function register({ sql, userId, now }: RequestContext, params: Params) {
  const input = validateRegistration({
    studentNo: stringParam(params, 'studentNo'),
    name: stringParam(params, 'name'),
    gender: stringParam(params, 'gender'),
    grade: stringParam(params, 'grade'),
  });
  if (!input.ok) throw new AppError(input.message);
  const { studentNo, name, gender, grade } = input.value;

  await inTransaction(sql, async (tx) => {
    if (await isAdmin(tx, userId)) {
      throw new AppError('管理者のログイン中は部員登録できません。');
    }
    const [mine] = await tx`select 1 from public.members where auth_user_id = ${userId}`;
    if (mine) throw new AppError('この端末はすでに登録されています。画面を開き直してください。');

    // 同じ学生番号が同時に登録されても片方だけになるよう、追加してから引き継ぎを考える
    const [created] = await tx`
      insert into public.members ${tx({
        student_no: studentNo,
        name,
        gender,
        grade,
        auth_user_id: userId,
        registered_at: now,
      })}
      on conflict (student_no) do nothing returning id`;
    if (created) return;

    // 主将が再登録を許可した部員を引き継ぐ。名前などはそのままで、承認はやり直し
    const [taken] = await tx`
      update public.members
      set auth_user_id = ${userId}, approved = false, registered_at = ${now}
      where student_no = ${studentNo} and auth_user_id is null returning id`;
    if (!taken) throw new AppError(ALREADY_USED);
  });
  return { home: await homeSnapshot(sql, userId, toPracticeDate(now)) };
}
