"use client";

import { useEffect, useState } from "react";
import type {
  JoinedRoomPayload,
  LiveRoomRuntimeSnapshot,
  Player,
  PlayerJoinedPayload,
  PlayerLeftPayload,
} from "@jprty/shared";
import { ROOM_EVENTS } from "@jprty/shared";
import { useSocket } from "@/lib/socket";

interface UseRoomRuntimeOptions {
  enabled?: boolean;
  onPlayerJoined?: (player: Player) => void;
  onPlayerLeft?: (player: Partial<Player>) => void;
}

function readRuntimeRoom(
  payload:
    | JoinedRoomPayload
    | PlayerJoinedPayload
    | PlayerLeftPayload
    | { room?: LiveRoomRuntimeSnapshot | null },
) {
  return payload.room ?? null;
}

export function useRoomRuntime(options: UseRoomRuntimeOptions = {}) {
  const { enabled = true, onPlayerJoined, onPlayerLeft } = options;
  const { socket } = useSocket();
  const [room, setRoom] = useState<LiveRoomRuntimeSnapshot | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);

  useEffect(() => {
    if (!socket || !enabled) {
      return;
    }

    const handleJoined = (payload: JoinedRoomPayload) => {
      setRoom(readRuntimeRoom(payload));
      setPlayer(payload.player);
    };

    const handlePlayerJoined = (payload: PlayerJoinedPayload) => {
      setRoom(readRuntimeRoom(payload));
      onPlayerJoined?.(payload.player);
    };

    const handlePlayerLeft = (payload: PlayerLeftPayload) => {
      setRoom(readRuntimeRoom(payload));
      onPlayerLeft?.(payload.player);
    };

    const handleState = (payload: { room?: LiveRoomRuntimeSnapshot | null }) => {
      setRoom(readRuntimeRoom(payload));
    };

    socket.on(ROOM_EVENTS.JOINED, handleJoined);
    socket.on(ROOM_EVENTS.PLAYER_JOINED, handlePlayerJoined);
    socket.on(ROOM_EVENTS.PLAYER_LEFT, handlePlayerLeft);
    socket.on(ROOM_EVENTS.STATE, handleState);

    return () => {
      socket.off(ROOM_EVENTS.JOINED, handleJoined);
      socket.off(ROOM_EVENTS.PLAYER_JOINED, handlePlayerJoined);
      socket.off(ROOM_EVENTS.PLAYER_LEFT, handlePlayerLeft);
      socket.off(ROOM_EVENTS.STATE, handleState);
    };
  }, [socket, enabled, onPlayerJoined, onPlayerLeft]);

  return {
    room,
    player,
  };
}
