export type MemberRecord = {
  name: string;
  colorIdx: number;
};

/** RTDB のルーム（議題は1件の文字列、票は memberId → 0〜100） */
export type RoomState = {
  createdAt: number;
  topicTitle: string;
  members: Record<string, MemberRecord>;
  votes: Record<string, number>;
};
