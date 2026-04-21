import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/**
 * Enter で送信したいときに使う。IME 変換確定の Enter は false。
 */
export function isEnterToSubmit(
  e: ReactKeyboardEvent<HTMLElement>,
): boolean {
  if (e.key !== "Enter") return false;
  const ne = e.nativeEvent;
  if (!(ne instanceof KeyboardEvent)) return true;
  if (ne.isComposing) return false;
  // IME 処理中のキー（ブラウザによっては isComposing が付かないことがある）
  if (ne.keyCode === 229) return false;
  return true;
}
