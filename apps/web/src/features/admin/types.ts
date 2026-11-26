/** 管理の操作を実行する。成功したら true */
export type RunAction = (action: string, params: object) => Promise<boolean>;
