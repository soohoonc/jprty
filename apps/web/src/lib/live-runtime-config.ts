import type { LiveRoomRuntimeBackend } from "@jprty/shared";

export function getPreferredLiveRuntimeBackend(): LiveRoomRuntimeBackend {
	const configured = process.env.NEXT_PUBLIC_LIVE_RUNTIME_BACKEND;
	if (configured === "spacetimedb") {
		return "spacetimedb";
	}
	return "prisma-socket-bridge";
}

export function getSpacetimeReadConfig() {
	return {
		baseUrl: process.env.NEXT_PUBLIC_SPACETIMEDB_URL,
		database: process.env.NEXT_PUBLIC_SPACETIMEDB_DATABASE,
		token: process.env.NEXT_PUBLIC_SPACETIMEDB_TOKEN,
		pollMs: Math.max(
			500,
			Number.parseInt(
				process.env.NEXT_PUBLIC_SPACETIMEDB_POLL_MS ?? "2000",
				10,
			) || 2000,
		),
	};
}

export function canUseDirectSpacetimeReads() {
	const backend = getPreferredLiveRuntimeBackend();
	if (backend !== "spacetimedb") {
		return false;
	}

	const config = getSpacetimeReadConfig();
	return Boolean(config.baseUrl && config.database);
}
