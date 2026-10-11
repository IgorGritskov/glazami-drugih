// Telegram can later implement this adapter without changing screen components.
export const platform = {
  haptic() { if (typeof navigator.vibrate === 'function') navigator.vibrate(12) },
}
