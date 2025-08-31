"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSocket } from "@/lib/socket";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Users, Trophy, Clock, Copy } from "lucide-react";

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
  const [isHost, setIsHost] = useState(false);
  const [gameStatus, setGameStatus] = useState<string>("WAITING");
  const [currentPlayer, setCurrentPlayer] = useState<string | null>(null);

  const { data: room, isLoading } = api.game.getRoom.useQuery(
    { roomCode },
    {
      enabled: !!roomCode,
      refetchInterval: gameStatus === "WAITING" ? 3000 : false,
    }
  );

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Join room via socket
    const playerName = localStorage.getItem("playerName") || "Guest";
    socket.emit("join-room", { roomCode, playerName });

    // Socket event listeners
    socket.on("joined-room", (data) => {
      setPlayers(data.players);
      setIsHost(data.isHost);
      setCurrentPlayer(data.player.id);
    });

    socket.on("player-joined", (data) => {
      setPlayers(data.players);
      toast.info(`${data.player.name || data.player.guestName} joined the room`);
    });

    socket.on("player-left", (data) => {
      setPlayers(data.players);
      toast.info(`${data.player.name || data.player.guestName} left the room`);
    });

    socket.on("game-started", (data) => {
      setGameStatus("IN_GAME");
      router.push(`/room/${roomCode}/play`);
    });

    socket.on("error", (data) => {
      toast.error(data.message);
    });

    return () => {
      socket.off("joined-room");
      socket.off("player-joined");
      socket.off("player-left");
      socket.off("game-started");
      socket.off("error");
    };
  }, [socket, isConnected, roomCode, router]);

  const handleStartGame = () => {
    if (!socket) return;
    socket.emit("start-game");
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    toast.success("Room code copied!");
  };

  const handleLeaveRoom = () => {
    if (!socket) return;
    socket.emit("leave-room");
    router.push("/game");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-purple-900">
        <div className="text-white text-2xl">Loading room...</div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-purple-900">
        <Card className="bg-white/95 backdrop-blur p-8">
          <CardContent>
            <h2 className="text-2xl font-bold mb-4">Room Not Found</h2>
            <p className="mb-4">The room code "{roomCode}" does not exist.</p>
            <Button onClick={() => router.push("/game")} className="w-full">
              Back to Lobby
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-white">JPRTY!</h1>
          <div className="flex items-center gap-4">
            <Card className="bg-white/95 backdrop-blur px-6 py-3">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">Room Code:</span>
                <span className="text-2xl font-mono font-bold text-blue-600">
                  {roomCode}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyCode}
                  className="ml-2"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </Card>
            <Button variant="destructive" onClick={handleLeaveRoom}>
              Leave Room
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Players List */}
          <div className="lg:col-span-2">
            <Card className="bg-white/95 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Users className="h-6 w-6" />
                  Players ({players.length}/{room.maxPlayers})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {players.map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                          {(player.name || player.guestName || "?")[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-lg">
                            {player.name || player.guestName}
                          </div>
                          <div className="flex gap-2">
                            {player.isHost && (
                              <Badge variant="default">Host</Badge>
                            )}
                            {player.id === currentPlayer && (
                              <Badge variant="secondary">You</Badge>
                            )}
                            {!player.isActive && (
                              <Badge variant="outline">Disconnected</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-yellow-500" />
                        <span className="text-2xl font-bold">{player.score}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Game Settings & Actions */}
          <div className="space-y-6">
            <Card className="bg-white/95 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-xl">Game Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Status</span>
                  <Badge variant={gameStatus === "WAITING" ? "secondary" : "default"}>
                    {gameStatus === "WAITING" ? "Waiting for Players" : "In Progress"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium">Difficulty</span>
                  <Badge variant="outline">
                    {room.configuration?.difficulty || "MEDIUM"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Buzz Window
                  </span>
                  <span>{(room.configuration?.buzzWindow || 5000) / 1000}s</span>
                </div>
              </CardContent>
            </Card>

            {isHost && gameStatus === "WAITING" && (
              <Card className="bg-white/95 backdrop-blur">
                <CardContent className="pt-6">
                  <Button
                    onClick={handleStartGame}
                    disabled={players.length < 2}
                    className="w-full text-lg py-6"
                    size="lg"
                  >
                    {players.length < 2
                      ? "Need at least 2 players"
                      : "Start Game"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {!isHost && gameStatus === "WAITING" && (
              <Card className="bg-white/95 backdrop-blur">
                <CardContent className="pt-6">
                  <p className="text-center text-gray-600 text-lg">
                    Waiting for the host to start the game...
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}