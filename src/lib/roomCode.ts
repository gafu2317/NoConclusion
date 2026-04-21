import { ROOM_CODE_REGEX } from "./constants";

export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_REGEX.test(code);
}

export function normalizeRoomCode(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}
