"use client";

import {
	canUseDirectSpacetimeReads,
	getSpacetimeReadConfig,
} from "@/lib/live-runtime-config";
import { getRoomByCodeFromSpacetime } from "@/lib/spacetimedb-read";
import { api } from "@/trpc/react";
import type { LiveRoomRuntimeSnapshot, Player } from "@jprty/shared";
import { useEffect, useState } from "react";

interface UseRoomRuntimeOptions {
	roomCode?: string | null;
	enabled?: boolean;
	onPlayerJoined?: (player: Player) => void;
	onPlayerLeft?: (player: Partial<Player>) => void;
}

export function useRoomRuntime(options: UseRoomRuntimeOptions = {}) {
	const { roomCode, enabled = true, onPlayerJoined } = options;
	const [room, setRoom] = useState<LiveRoomRuntimeSnapshot | null>(null);
	const [player, setPlayer] = useState<Player | null>(null);
	const [clientSpacetimeFailed, setClientSpacetimeFailed] = useState(false);
	const config = getSpacetimeReadConfig();
	const directSpacetimeEnabled =
		enabled && !!roomCode && canUseDirectSpacetimeReads();
	const serverSpacetimeFallbackEnabled =
		enabled && !!roomCode && (!directSpacetimeEnabled || clientSpacetimeFailed);

	const serverRuntime = api.game.getLiveRoomRuntime.useQuery(
		{ roomCode: (roomCode ?? "").toUpperCase() },
		{
			enabled: serverSpacetimeFallbackEnabled,
			refetchInterval: config.pollMs,
			refetchIntervalInBackground: true,
			retry: false,
		},
	);

	useEffect(() => {
		if (!directSpacetimeEnabled || !roomCode) {
			return;
		}

		setClientSpacetimeFailed(false);

		const { baseUrl, database, pollMs } = getSpacetimeReadConfig();
		if (!baseUrl || !database) {
			setClientSpacetimeFailed(true);
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
						"[spacetimedb] client room read failed, switching to server runtime poll",
						error,
					);
					setClientSpacetimeFailed(true);
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
		if (!serverSpacetimeFallbackEnabled) {
			return;
		}

		const nextRoom = serverRuntime.data ?? null;
		if (!nextRoom) {
			return;
		}

		const previousPlayerIds = new Set((room?.players ?? []).map((p) => p.id));
		for (const runtimePlayer of nextRoom.players) {
			if (!previousPlayerIds.has(runtimePlayer.id)) {
				onPlayerJoined?.(runtimePlayer);
			}
		}

		setRoom(nextRoom);
	}, [serverSpacetimeFallbackEnabled, serverRuntime.data, room, onPlayerJoined]);

	useEffect(() => {
		if (!roomCode || !enabled) {
			setRoom(null);
			setPlayer(null);
		}
	}, [roomCode, enabled]);

	return {
		room,
		player,
		usingSocketFallback: false,
	};
}
