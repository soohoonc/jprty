import { Server, Socket } from "socket.io";
import { db } from "@jprty/db";
import { GAME_EVENTS, ROOM_EVENTS } from "@jprty/shared";
import { gameState } from "../game/state";
import { gameRuntime, liveRoomRuntime } from "../runtime";

function getSocketRoomId(socket: Socket) {
  const rooms = Array.from(socket.rooms).filter((roomId) => roomId !== socket.id);
  return rooms[0];
}

export function room(io: Server, socket: Socket) {
  socket.on(
    ROOM_EVENTS.JOIN,
    async (data: { roomCode: string; playerName: string; isHost?: boolean }) => {
      try {
        if (data.isHost) {
          const payload = await liveRoomRuntime.joinHost(socket.id, data.roomCode);
          socket.join(payload.room!.roomId);
          socket.emit(ROOM_EVENTS.JOINED, payload);
          return;
        }

        const { roomId, payload } = await liveRoomRuntime.joinPlayer(
          socket.id,
          data.roomCode,
          data.playerName,
        );

        socket.join(roomId);
        socket.emit(ROOM_EVENTS.JOINED, payload);

        const joinedPayload = await liveRoomRuntime.buildPlayerJoinedPayload(
          roomId,
          payload.player.id,
        );

        socket.to(roomId).emit(ROOM_EVENTS.PLAYER_JOINED, joinedPayload);
      } catch (error: any) {
        console.error("room:join error:", error);
        socket.emit(ROOM_EVENTS.ERROR, { message: error.message });
      }
    },
  );

  socket.on(ROOM_EVENTS.LEAVE, async () => {
    try {
      const connection = liveRoomRuntime.getConnection(socket.id);
      const leavePayload = await liveRoomRuntime.leave(socket.id);

      if (!connection || !leavePayload) {
        return;
      }

      socket.leave(connection.roomId);
      socket.to(connection.roomId).emit(ROOM_EVENTS.PLAYER_LEFT, leavePayload);
    } catch (error: any) {
      console.error("room:leave error:", error);
      socket.emit(ROOM_EVENTS.ERROR, { message: error.message });
    }
  });

  socket.on(ROOM_EVENTS.START_GAME, async () => {
    try {
      const roomId = getSocketRoomId(socket);
      if (!roomId) {
        socket.emit(ROOM_EVENTS.ERROR, { message: "Not in a room" });
        return;
      }

      if (!liveRoomRuntime.isHost(socket.id)) {
        socket.emit(ROOM_EVENTS.ERROR, { message: "Only the host can start the game" });
        return;
      }

      if (!gameState.get(roomId)) {
        gameState.create(roomId);
      }

      gameState.onStateChange(roomId, (newState) => {
        if (newState.phase === "BUZZING") {
          io.to(roomId).emit(GAME_EVENTS.BUZZER_OPEN, {
            timeRemaining: newState.timeRemaining,
          });
        }

        if (newState.phase === "GAME_END") {
          void db.room
            .update({
              where: { id: roomId },
              data: { status: "FINISHED" },
            })
            .then(() => liveRoomRuntime.syncRoomSnapshot(roomId))
            .catch((error: unknown) => {
              console.error("room:game_end sync error:", error);
            });
          io.to(roomId).emit(GAME_EVENTS.GAME_END, gameRuntime.buildGameEndPayload(newState));
        }

        io.to(roomId).emit(GAME_EVENTS.STATE_UPDATE, gameRuntime.buildIncrementalStateUpdate(newState));
      });

      await gameState.start(roomId);
      await db.room.update({
        where: { id: roomId },
        data: { status: "IN_GAME" },
      });
      await liveRoomRuntime.syncRoomSnapshot(roomId);
      io.to(roomId).emit(
        ROOM_EVENTS.GAME_STARTED,
        gameRuntime.buildGameStarted(gameState.getSnapshot(roomId)),
      );
    } catch (error: any) {
      console.error("room:start_game error:", error);
      socket.emit(ROOM_EVENTS.ERROR, { message: error.message });
    }
  });

  socket.on(
    ROOM_EVENTS.GET_STATE,
    async (data?: { isHost?: boolean; playerId?: string }) => {
      try {
        const roomId = getSocketRoomId(socket);
        if (!roomId) {
          socket.emit(ROOM_EVENTS.ERROR, { message: "Not in a room" });
          return;
        }

        liveRoomRuntime.ensureConnection(socket.id, roomId, {
          isHost: data?.isHost === true,
          playerId: data?.playerId,
        });

        const room = await liveRoomRuntime.getSnapshot(roomId);
        socket.emit(ROOM_EVENTS.STATE, gameRuntime.buildRoomState(room, gameState.getSnapshot(roomId)));
      } catch (error: any) {
        console.error("room:get_state error:", error);
        socket.emit(ROOM_EVENTS.ERROR, { message: error.message });
      }
    },
  );

  socket.on("disconnect", async () => {
    const connection = liveRoomRuntime.getConnection(socket.id);
    if (!connection) {
      return;
    }

    try {
      const leavePayload = await liveRoomRuntime.leave(socket.id);
      if (!leavePayload) {
        return;
      }

      socket.to(connection.roomId).emit(ROOM_EVENTS.PLAYER_LEFT, leavePayload);
    } catch (error) {
      console.error("room:disconnect error:", error);
    }
  });
}
