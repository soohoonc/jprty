import type { LiveRoomRuntimeBackend } from "@jprty/shared";

function cleanEnv(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

export function getPreferredLiveRuntimeBackend(): LiveRoomRuntimeBackend {
	const configured = cleanEnv(process.env.NEXT_PUBLIC_LIVE_RUNTIME_BACKEND);
	if (configured === "spacetimedb") {
		return "spacetimedb";
	}
	return "prisma-socket-bridge";
}

export function getSpacetimeReadConfig() {
	const pollRaw = cleanEnv(process.env.NEXT_PUBLIC_SPACETIMEDB_POLL_MS);
	return {
		baseUrl: cleanEnv(process.env.NEXT_PUBLIC_SPACETIMEDB_URL),
		database: cleanEnv(process.env.NEXT_PUBLIC_SPACETIMEDB_DATABASE),
		pollMs: Math.max(
			500,
			Number.parseInt(
				pollRaw ?? "2000",
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
