/** 反対 / 中立 / 賛成 の境界（0〜100、三等分） */
export const VOTE_BUCKETS = {
  opposeMax: 33,
  neutralMin: 34,
  neutralMax: 66,
  favorMin: 67,
} as const;

/** メンバー表示色（Tailwind の bg クラス名のサフィックス） */
export const MEMBER_COLOR_CLASSES = [
  "bg-rose-500",
  "bg-sky-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-cyan-500",
  "bg-fuchsia-500",
  "bg-lime-500",
] as const;

/** ルーム保持期間（ミリ秒） */
export const ROOM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const ROOM_CODE_REGEX = /^[a-z0-9]{8}$/;
