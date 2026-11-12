import { shallowRef } from "vue";
export const voiceOwner = shallowRef<symbol | null>(null);
let notify: (() => void) | undefined;
export function claimVoice(id: symbol, warn: () => void) {
  if (voiceOwner.value && voiceOwner.value !== id) {
    notify?.();
    return false;
  }
  voiceOwner.value = id;
  notify = warn;
  return true;
}
export function releaseVoice(id: symbol) {
  if (voiceOwner.value !== id) return;
  voiceOwner.value = null;
  notify = undefined;
}
export function canLeaveVoice() {
  if (!voiceOwner.value) return true;
  notify?.();
  return false;
}
