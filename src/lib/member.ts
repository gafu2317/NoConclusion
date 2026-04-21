const STORAGE_PREFIX = "noc_member_";

export function getOrCreateMemberId(roomCode: string): string {
  if (typeof window === "undefined") {
    throw new Error("getOrCreateMemberId is client-only");
  }
  const key = `${STORAGE_PREFIX}${roomCode}`;
  const existing = window.localStorage.getItem(key);
  if (existing && existing.length > 0) return existing;
  const id = crypto.randomUUID();
  window.localStorage.setItem(key, id);
  return id;
}

export function clearMemberId(roomCode: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`${STORAGE_PREFIX}${roomCode}`);
}

export function pickColorIdx(memberId: string, memberCount: number): number {
  let h = 0;
  for (let i = 0; i < memberId.length; i++) {
    h = (h * 31 + memberId.charCodeAt(i)) >>> 0;
  }
  return memberCount > 0 ? h % 8 : h % 8;
}
