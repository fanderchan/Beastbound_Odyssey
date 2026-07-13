"use strict";

function battleRoomForMutation(data, roomIdOrRoom) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new TypeError("battle room mutation root must be an object");
  }
  const rooms = data.battleRooms && typeof data.battleRooms === "object" && !Array.isArray(data.battleRooms)
    ? data.battleRooms
    : (data.battleRooms = {});
  const roomId = typeof roomIdOrRoom === "string"
    ? roomIdOrRoom.trim()
    : String(roomIdOrRoom && roomIdOrRoom.roomId || "").trim();
  if (roomId === "") {
    return null;
  }
  const room = rooms[roomId] || null;
  if (!room || typeof room !== "object" || Array.isArray(room)) {
    return null;
  }
  if (!Object.isFrozen(room)) {
    return room;
  }
  // normalizeData() certifies and deep-freezes published room entries. A
  // request owns the battleRooms container but materializes a room only when a
  // writer is about to change it, keeping unrelated active battles shared.
  const mutableRoom = JSON.parse(JSON.stringify(room));
  rooms[roomId] = mutableRoom;
  return mutableRoom;
}

module.exports = {
  battleRoomForMutation,
};
