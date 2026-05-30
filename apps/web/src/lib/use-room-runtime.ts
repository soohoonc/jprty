"use client";

import {
	canUseDirectSpacetimeReads,
	getSpacetimeReadConfig,
} from "@/lib/live-runtime-config";
import { useSocket } from "@/lib/socket";
import { getRoomByCodeFromSpacetime } from "@/lib/spacetimedb-read";
import type {
	JoinedRoomPayload,
	LiveRoomRuntimeSnapshot,
	Player,
	PlayerJoinedPayload,
	PlayerLeftPayload,
} from "@jprty/shared";
import { ROOM_EVENTS } from "@jprty/shared";
import { useEffect, useState } from "react";

interface UseRoomRuntimeOptions {
	roomCode?: string | null;
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
	const { roomCode, enabled = true, onPlayerJoined, onPlayerLeft } = options;
	const { socket } = useSocket();
	const [room, setRoom] = useState<LiveRoomRuntimeSnapshot | null>(null);
	const [player, setPlayer] = useState<Player | null>(null);
	const [spacetimeFailed, setSpacetimeFailed] = useState(false);
	const directSpacetimeEnabled =
		enabled && !!roomCode && canUseDirectSpacetimeReads();
	const useSocketFallback = !directSpacetimeEnabled || spacetimeFailed;

	useEffect(() => {
		if (!directSpacetimeEnabled || !roomCode) {
			return;
		}

			setSpacetimeFailed(false);

			const config = getSpacetimeReadConfig();
			const { baseUrl, database, pollMs } = config;
			if (!baseUrl || !database) {
				setSpacetimeFailed(true);
				return;
			}

		let cancelled = false;

		const syncRoom = async () => {
			try {
					const nextRoom = await getRoomByCodeFromSpacetime({
						baseUrl,
						database,
						roomCode,
					});

				if (!cancelled) {
					setRoom(nextRoom);
				}
			} catch (error) {
				if (!cancelled) {
					console.warn(
						"[spacetimedb] room read failed, falling back to socket runtime",
						error,
					);
					setSpacetimeFailed(true);
				}
			}
		};

		void syncRoom();
		const pollId = window.setInterval(() => {
			void syncRoom();
		}, pollMs);

		return () => {
			cancelled = true;
			window.clearInterval(pollId);
		};
	}, [directSpacetimeEnabled, roomCode]);

	useEffect(() => {
		if (!socket || !enabled || !useSocketFallback) {
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

		const handleState = (payload: {
			room?: LiveRoomRuntimeSnapshot | null;
		}) => {
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
	}, [socket, enabled, onPlayerJoined, onPlayerLeft, useSocketFallback]);

	return {
		room,
		player,
		usingSocketFallback: useSocketFallback,
	};
}
