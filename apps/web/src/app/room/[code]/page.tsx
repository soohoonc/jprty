"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSocket } from "@/lib/socket";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ROOM_EVENTS } from "@jprty/shared";

interface Player {
  id: string;
  name?: string;
  guestName?: string;
  score: number;
  isHost: boolean;
  isActive: boolean;
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.code as string;
  const { socket, isConnected } = useSocket();
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<string | null>(null);

  const { data: room, isLoading } = api.game.getRoom.useQuery(
    { roomCode },
    { enabled: !!roomCode }
  );

  useEffect(() => {
    if (!socket || !isConnected) return;

    const playerName = localStorage.getItem("playerName") || "Guest";
    socket.emit(ROOM_EVENTS.JOIN, { roomCode, playerName });

    socket.on(ROOM_EVENTS.JOINED, (data) => {
      setPlayers(data.players);
      setCurrentPlayer(data.player.id);
      localStorage.setItem("playerId", data.player.id);
    });

    socket.on(ROOM_EVENTS.PLAYER_JOINED, (data) => {
      setPlayers(data.players);
      toast.info(`${data.player.name || data.player.guestName} joined`);
    });

    socket.on(ROOM_EVENTS.PLAYER_LEFT, (data) => {
      setPlayers(data.players);
    });

    socket.on(ROOM_EVENTS.GAME_STARTED, () => {
      router.push(`/room/${roomCode}/play`);
    });

    socket.on(ROOM_EVENTS.ERROR, (data) => {
      toast.error(data.message);
    });

    return () => {
      socket.off(ROOM_EVENTS.JOINED);
      socket.off(ROOM_EVENTS.PLAYER_JOINED);
      socket.off(ROOM_EVENTS.PLAYER_LEFT);
      socket.off(ROOM_EVENTS.GAME_STARTED);
      socket.off(ROOM_EVENTS.ERROR);
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
    <div className="min-h-screen bg-blue-900 p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Room Code */}
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Room Code</p>
            <p className="text-3xl font-mono font-bold tracking-widest">
              {roomCode}
            </p>
          </CardContent>
        </Card>

        {/* Players */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Players ({players.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {players.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-2 border rounded"
                >
                  <span className="font-medium">
                    {player.name || player.guestName}
                  </span>
                  {player.id === currentPlayer && (
                    <Badge variant="secondary">You</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Status */}
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Waiting for host to start the game...
          </CardContent>
        </Card>

        <Button variant="outline" onClick={handleLeaveRoom} className="w-full">
          Leave Room
        </Button>
      </div>
    </div>
  );
}
