import { useEffect, useState } from 'react';

const CONFIRM_WINDOW_MS = 4000;

type ConfirmButtonProps = {
  label: string;
  className?: string;
  disabled?: boolean;
  onConfirm: () => void;
};

/** 1回目のタップで確認し、4秒以内の2回目で実行するボタン */
export function ConfirmButton({ label, className, disabled, onConfirm }: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), CONFIRM_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      className={armed ? `${className ?? ''} danger` : className}
      disabled={disabled}
      onClick={() => {
        setArmed(!armed);
        if (armed) onConfirm();
      }}
    >
      {armed ? 'もう一度で確定' : label}
    </button>
  );
}
