import { notFound } from "next/navigation";
import { RoomView } from "@/components/room/RoomView";
import { isValidRoomCode } from "@/lib/roomCode";

type Props = {
  params: Promise<{ roomCode: string }>;
};

export default async function RoomPage({ params }: Props) {
  const { roomCode } = await params;
  if (!isValidRoomCode(roomCode)) notFound();
  return <RoomView roomCode={roomCode} />;
}
