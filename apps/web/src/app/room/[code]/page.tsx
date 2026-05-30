"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useRoomRuntime } from "@/lib/use-room-runtime";
import { api } from "@/trpc/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

const ROOM_MEMBERSHIP_STORAGE_KEY = "roomMembership";

type StoredRoomMembership = {
	roomCode: string;
	playerName: string;
	playerId: string;
};

function readStoredRoomMembership(): StoredRoomMembership | null {
	const raw = localStorage.getItem(ROOM_MEMBERSHIP_STORAGE_KEY);
	if (!raw) {
		return null;
	}

	try {
		const parsed = JSON.parse(raw) as Partial<StoredRoomMembership>;
		if (!parsed.roomCode || !parsed.playerName || !parsed.playerId) {
			return null;
		}

		return {
			roomCode: parsed.roomCode,
			playerName: parsed.playerName,
			playerId: parsed.playerId,
		};
	} catch {
		return null;
	}
}

function writeStoredRoomMembership(membership: StoredRoomMembership) {
	localStorage.setItem(ROOM_MEMBERSHIP_STORAGE_KEY, JSON.stringify(membership));
}

export default function RoomPage() {
	const params = useParams();
	const router = useRouter();
	const roomCode = params.code as string;
	const hasAttemptedJoinRef = useRef(false);
	const isLeavingRef = useRef(false);
	const { room: runtimeRoom, player } = useRoomRuntime({
		roomCode,
		enabled: !!roomCode,
	});

	const { data: room, isLoading } = api.game.getRoom.useQuery(
		{ roomCode },
		{ enabled: !!roomCode },
	);
	const joinRoom = api.game.joinRoom.useMutation();
	const leaveRoom = api.game.leaveRoom.useMutation();

	// Check if game already started via tRPC
	const { data: gameState } = api.game.getGameState.useQuery(
		{ roomCode },
		{ enabled: !!roomCode },
	);

	// Redirect if game is already in progress
	useEffect(() => {
		if (gameState && gameState.phase !== "LOBBY") {
			router.push(`/room/${roomCode}/play`);
		}
	}, [gameState, roomCode, router]);

	useEffect(() => {
		if (!player?.id) {
			return;
		}

		localStorage.setItem("playerId", player.id);
	}, [player?.id]);

	useEffect(() => {
		if (!roomCode || !room || hasAttemptedJoinRef.current) {
			return;
		}

		hasAttemptedJoinRef.current = true;
		const normalizedRoomCode = roomCode.toUpperCase();
		const playerName = localStorage.getItem("playerName")?.trim() || "Guest";
		const existingMembership = readStoredRoomMembership();

		if (
			existingMembership &&
			existingMembership.roomCode === normalizedRoomCode &&
			existingMembership.playerName === playerName
		) {
			localStorage.setItem("playerId", existingMembership.playerId);
			return;
		}

		joinRoom
			.mutateAsync({
				roomCode: normalizedRoomCode,
				playerName,
			})
			.then((joinedPlayer) => {
				localStorage.setItem("playerId", joinedPlayer.id);
				writeStoredRoomMembership({
					roomCode: normalizedRoomCode,
					playerName,
					playerId: joinedPlayer.id,
				});
			})
			.catch((error) => {
				hasAttemptedJoinRef.current = false;
				toast.error(error.message ?? "Failed to join room");
			});
	}, [joinRoom, room, roomCode]);

	const handleLeaveRoom = async () => {
		if (isLeavingRef.current) {
			return;
		}

		isLeavingRef.current = true;
		const normalizedRoomCode = roomCode.toUpperCase();
		const membership = readStoredRoomMembership();
		const playerId = localStorage.getItem("playerId");

		if (playerId && membership?.roomCode === normalizedRoomCode) {
			try {
				await leaveRoom.mutateAsync({
					roomCode: normalizedRoomCode,
					playerId,
				});
			} catch (error) {
				console.warn("[room.leaveRoom] tRPC leaveRoom failed", error);
			}
		}

		if (membership?.roomCode === normalizedRoomCode || playerId) {
			localStorage.removeItem(ROOM_MEMBERSHIP_STORAGE_KEY);
			localStorage.removeItem("playerId");
		}

		router.push("/");
	};

	if (isLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-blue-900">
				<p className="text-white">Loading...</p>
			</div>
		);
	}

	if (!room) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-blue-900 p-4">
				<Card className="w-full max-w-sm">
					<CardContent className="pt-6 text-center">
						<p className="mb-4">Room not found</p>
						<Button onClick={() => router.push("/")} className="w-full">
							Back to Home
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen flex-col bg-blue-900 p-4">
			{/* Room Code - small text at top */}
			<div className="mb-4 text-center">
				<span className="text-sm text-white/60">Room </span>
				<span className="font-mono font-semibold text-white">{roomCode}</span>
			</div>

			{/* Main content - centered */}
			<div className="flex flex-1 items-center justify-center">
				<div className="space-y-4 text-center">
					<p className="text-white/70">Waiting for host to start the game...</p>
					{runtimeRoom && (
						<p className="text-sm text-white/50">
							{runtimeRoom.numPlayers} / {runtimeRoom.maxPlayers} players joined
						</p>
					)}
					<div className="flex items-center justify-center gap-2 text-white/50">
						<div
							className="h-2 w-2 animate-bounce rounded-full bg-white/50"
							style={{ animationDelay: "0ms" }}
						/>
						<div
							className="h-2 w-2 animate-bounce rounded-full bg-white/50"
							style={{ animationDelay: "150ms" }}
						/>
						<div
							className="h-2 w-2 animate-bounce rounded-full bg-white/50"
							style={{ animationDelay: "300ms" }}
						/>
					</div>
				</div>
			</div>

			{/* Leave button at bottom */}
			<div className="mt-auto pt-4">
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button
							variant="ghost"
							className="w-full text-white/60 hover:bg-white/10 hover:text-white"
						>
							Leave Room
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Leave room?</AlertDialogTitle>
							<AlertDialogDescription>
								Are you sure you want to leave this room?
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction onClick={handleLeaveRoom}>
								Leave
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</div>
	);
}
