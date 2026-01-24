"use client";

import { useEffect } from "react";
import { useSocket } from "./socket";
import { api } from "@/trpc/react";
import { GAME_EVENTS, ROOM_EVENTS } from "@jprty/shared";

interface UseSocketInvalidationOptions {
  roomCode: string;
  enabled?: boolean;
}

/**
 * Hook that bridges socket events to React Query cache invalidation.
 * When socket events occur, it invalidates the relevant React Query caches
 * so the UI automatically updates.
 */
export function useSocketInvalidation({
  roomCode,
  enabled = true,
}: UseSocketInvalidationOptions) {
  const { socket, isConnected } = useSocket();
  const utils = api.useUtils();

  useEffect(() => {
    if (!socket || !isConnected || !roomCode || !enabled) return;

    const invalidateGameState = () => {
      utils.game.getGameState.invalidate({ roomCode });
    };

    const invalidateRoom = () => {
      utils.game.getRoom.invalidate({ roomCode });
    };

    const invalidateAll = () => {
      invalidateGameState();
      invalidateRoom();
    };

    // Room events - invalidate room data (players, config)
    socket.on(ROOM_EVENTS.PLAYER_JOINED, invalidateRoom);
    socket.on(ROOM_EVENTS.PLAYER_LEFT, invalidateRoom);
    socket.on(ROOM_EVENTS.JOINED, invalidateAll); // Invalidate both room and game state

    // Game state events - invalidate game state
    socket.on(ROOM_EVENTS.GAME_STARTED, invalidateAll);
    socket.on(ROOM_EVENTS.STATE, invalidateGameState); // Response to GET_STATE (refresh handling)
    socket.on(GAME_EVENTS.STATE_UPDATE, invalidateGameState);
    socket.on(GAME_EVENTS.QUESTION_SELECTED, invalidateGameState);
    socket.on(GAME_EVENTS.BUZZER_OPEN, invalidateGameState);
    socket.on(GAME_EVENTS.PLAYER_BUZZED, invalidateGameState);
    socket.on(GAME_EVENTS.ANSWER_RESULT, invalidateGameState);
    socket.on(GAME_EVENTS.DAILY_DOUBLE, invalidateGameState);
    socket.on(GAME_EVENTS.ROUND_END, invalidateGameState);
    socket.on(GAME_EVENTS.FINAL_JEOPARDY_START, invalidateGameState);
    socket.on(GAME_EVENTS.FINAL_JEOPARDY_REVEAL, invalidateGameState);
    socket.on(GAME_EVENTS.GAME_END, invalidateAll);

    return () => {
      socket.off(ROOM_EVENTS.PLAYER_JOINED, invalidateRoom);
      socket.off(ROOM_EVENTS.PLAYER_LEFT, invalidateRoom);
      socket.off(ROOM_EVENTS.JOINED, invalidateAll);
      socket.off(ROOM_EVENTS.GAME_STARTED, invalidateAll);
      socket.off(ROOM_EVENTS.STATE, invalidateGameState);
      socket.off(GAME_EVENTS.STATE_UPDATE, invalidateGameState);
      socket.off(GAME_EVENTS.QUESTION_SELECTED, invalidateGameState);
      socket.off(GAME_EVENTS.BUZZER_OPEN, invalidateGameState);
      socket.off(GAME_EVENTS.PLAYER_BUZZED, invalidateGameState);
      socket.off(GAME_EVENTS.ANSWER_RESULT, invalidateGameState);
      socket.off(GAME_EVENTS.DAILY_DOUBLE, invalidateGameState);
      socket.off(GAME_EVENTS.ROUND_END, invalidateGameState);
      socket.off(GAME_EVENTS.FINAL_JEOPARDY_START, invalidateGameState);
      socket.off(GAME_EVENTS.FINAL_JEOPARDY_REVEAL, invalidateGameState);
      socket.off(GAME_EVENTS.GAME_END, invalidateAll);
    };
  }, [socket, isConnected, roomCode, enabled, utils]);
}
