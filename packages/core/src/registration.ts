import { GENDERS, GRADES, type Gender, type Grade } from './member.ts';
import { invalid, type Validated } from './validation.ts';

export const NAME_MAX_LENGTH = 30;

export type Registration = {
  studentNo: string;
  name: string;
  gender: Gender;
  grade: Grade;
};

export function normalizeStudentNo(value: string): string {
  return value.replace(/\s/g, '').toUpperCase();
}

export function validateRegistration(input: {
  studentNo: string;
  name: string;
  gender: string;
  grade: string;
}): Validated<Registration> {
  const studentNo = normalizeStudentNo(input.studentNo);
  const name = input.name.trim().replace(/\s+/g, ' ');
  const gender = GENDERS.find((candidate) => candidate === input.gender);
  const grade = GRADES.find((candidate) => candidate === input.grade);

  if (!/^[A-Z0-9]{4,12}$/.test(studentNo)) {
    return invalid('学生番号を英数字で正しく入力してください。');
  }
  if (!name || name.length > NAME_MAX_LENGTH) return invalid('名前を入力してください。');
  if (!gender) return invalid('性別を選んでください。');
  if (!grade) return invalid('学年を選んでください。');
  return { ok: true, value: { studentNo, name, gender, grade } };
}
