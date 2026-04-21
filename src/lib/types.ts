export type TopicRecord = {
  title: string;
  order: number;
};

export type MemberRecord = {
  name: string;
  colorIdx: number;
};

export type RoomState = {
  createdAt: number;
  activeTopicId: string | null;
  topics: Record<string, TopicRecord>;
  members: Record<string, MemberRecord>;
  votes: Record<string, Record<string, number>>;
};
