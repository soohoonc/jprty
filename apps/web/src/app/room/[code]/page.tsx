"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSocket } from "@/lib/socket";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { toast } from "sonner";
import { ROOM_EVENTS } from "@jprty/shared";
import { useRoomRuntime } from "@/lib/use-room-runtime";

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.code as string;
  const { socket, isConnected } = useSocket();
  const joinedSocketId = useRef<string | undefined>(undefined);
  const { room: runtimeRoom, player } = useRoomRuntime({ enabled: !!roomCode && isConnected });

  const { data: room, isLoading } = api.game.getRoom.useQuery(
    { roomCode },
    { enabled: !!roomCode }
  );

  // Check if game already started via tRPC
  const { data: gameState } = api.game.getGameState.useQuery(
    { roomCode },
    { enabled: !!roomCode }
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

  // Join room when socket connects
  useEffect(() => {
    if (!socket || !isConnected) return;

    // Only emit JOIN once per socket connection
    if (joinedSocketId.current !== socket.id) {
      joinedSocketId.current = socket.id;
      const name = localStorage.getItem("playerName") || "Guest";
      socket.emit(ROOM_EVENTS.JOIN, { roomCode, playerName: name });
    }

    // Always register listeners (they get cleaned up and need re-registering)
    const handleGameStarted = () => {
      router.push(`/room/${roomCode}/play`);
    };

    const handleError = (data: { message: string }) => {
      toast.error(data.message);
    };

    socket.on(ROOM_EVENTS.GAME_STARTED, handleGameStarted);
    socket.on(ROOM_EVENTS.ERROR, handleError);

    return () => {
      socket.off(ROOM_EVENTS.GAME_STARTED, handleGameStarted);
      socket.off(ROOM_EVENTS.ERROR, handleError);
    };
  }, [socket, isConnected, roomCode, router]);

  const handleLeaveRoom = () => {
    if (socket) {
      socket.emit(ROOM_EVENTS.LEAVE);
    }
    router.push("/");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-900">
        <p className="text-white">Loading...</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-900 p-4">
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
    <div className="min-h-screen bg-blue-900 p-4 flex flex-col">
      {/* Room Code - small text at top */}
      <div className="text-center mb-4">
        <span className="text-white/60 text-sm">Room </span>
        <span className="text-white font-mono font-semibold">{roomCode}</span>
      </div>

      {/* Main content - centered */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-white/70">Waiting for host to start the game...</p>
          {runtimeRoom && (
            <p className="text-white/50 text-sm">
              {runtimeRoom.numPlayers} / {runtimeRoom.maxPlayers} players joined
            </p>
          )}
          <div className="flex items-center justify-center gap-2 text-white/50">
            <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      </div>

      {/* Leave button at bottom */}
      <div className="mt-auto pt-4">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" className="w-full text-white/60 hover:text-white hover:bg-white/10">
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
              <AlertDialogAction onClick={handleLeaveRoom}>Leave</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
