/** 承認されるまでの手順と、いまの段階 */
export function SignupSteps({ komaSaved }: { komaSaved: boolean }) {
  const steps = [
    { label: '部員登録', done: true },
    { label: 'コマ表を保存', done: komaSaved },
    { label: '主将の承認', done: false },
  ];
  const current = steps.findIndex((step) => !step.done);

  return (
    <div className="signup-steps">
      <ol>
        {steps.map((step, index) => (
          <li
            key={step.label}
            className={step.done ? 'step-done' : index === current ? 'step-current' : undefined}
            aria-current={index === current ? 'step' : undefined}
          >
            {step.label}
            {step.done && '（済み）'}
          </li>
        ))}
      </ol>
      <p>
        {komaSaved
          ? '主将の承認を待っています。承認されると打刻できます。'
          : '「授業のコマ」にチェックして保存してください。授業がなくても保存します。'}
      </p>
    </div>
  );
}
