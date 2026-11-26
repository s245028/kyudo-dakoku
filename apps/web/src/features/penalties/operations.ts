/** 副務・主将の罰の操作。`run` は成功したら true */
export type PenaltyOperations = {
  sending: boolean;
  run: (action: string, params: object) => Promise<boolean>;
};
