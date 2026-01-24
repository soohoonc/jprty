"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/lib/socket";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy, Monitor, Smartphone, Eye } from "lucide-react";
import { RoomSettings } from "@/components/game/room-settings";
import { ROOM_EVENTS } from "@jprty/shared";

interface Player {
  id: string;
  name?: string;
  guestName?: string;
  score: number;
  isHost: boolean;
  isActive: boolean;
}

type Mode = "host" | "join" | "spectate";

export default function Home() {
  const router = useRouter();
  const { socket, isConnected } = useSocket();

  // Mode state - null until we detect device
  const [mode, setMode] = useState<Mode | null>(null);

  // Host state
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);

  // Join state
  const [joinCode, setJoinCode] = useState("");
  const [playerName, setPlayerName] = useState("");

  // Set default mode based on device width (only on mount)
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    setMode(isMobile ? "join" : "host");
  }, []);

  const createRoomMutation = api.game.createRoom.useMutation({
    onSuccess: (room) => {
      setRoomCode(room.code);
      setRoomId(room.id);
      localStorage.setItem("isHost", "true");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Create room when switching to host mode
  useEffect(() => {
    if (mode === "host" && !roomCode && !createRoomMutation.isPending) {
      createRoomMutation.mutate({ name: "Host" });
    }
  }, [mode, roomCode, createRoomMutation.isPending]);

  // Connect to socket once room is created (host mode)
  useEffect(() => {
    if (!socket || !isConnected || !roomCode || mode !== "host") return;

    socket.emit(ROOM_EVENTS.JOIN, { roomCode, playerName: "Host", isHost: true });

    socket.on(ROOM_EVENTS.JOINED, (data) => {
      setPlayers(data.players.filter((p: Player) => !p.isHost));
    });

    socket.on(ROOM_EVENTS.PLAYER_JOINED, (data) => {
      setPlayers(data.players.filter((p: Player) => !p.isHost));
      toast.info(`${data.player.name || data.player.guestName} joined`);
    });

    socket.on(ROOM_EVENTS.PLAYER_LEFT, (data) => {
      setPlayers(data.players.filter((p: Player) => !p.isHost));
      if (data.player?.name || data.player?.guestName) {
        toast.info(`${data.player.name || data.player.guestName} left`);
      }
    });

    socket.on(ROOM_EVENTS.GAME_STARTED, () => {
      router.push(`/room/${roomCode}/host`);
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
  }, [socket, isConnected, roomCode, router, mode]);

  const handleStartGame = () => {
    if (!socket) return;
    socket.emit(ROOM_EVENTS.START_GAME);
  };

  const handleCopyCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode);
      toast.success("Room code copied!");
    }
  };

  const handleJoinRoom = () => {
    if (!joinCode.trim()) {
      toast.error("Please enter a room code");
      return;
    }
    if (!playerName.trim()) {
      toast.error("Please enter your name");
      return;
    }
    localStorage.setItem("playerName", playerName.trim());
    router.push(`/room/${joinCode.toUpperCase()}`);
  };

  const handleSwitchMode = (newMode: Mode) => {
    if (newMode === "host" && !roomCode && !createRoomMutation.isPending) {
      createRoomMutation.mutate({ name: "Host" });
    }
    setMode(newMode);
  };

  // Loading state while detecting device
  if (mode === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-900">
        <h1 className="text-4xl font-bold text-white">JPRTY!</h1>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-900 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-4xl font-bold text-white text-center py-4">JPRTY!</h1>

        {/* Mode Switcher */}
        <div className="flex gap-2 justify-center">
          <Button
            variant={mode === "host" ? "default" : "outline"}
            size="sm"
            onClick={() => handleSwitchMode("host")}
            className="gap-2"
          >
            <Monitor className="h-4 w-4" />
            Host
          </Button>
          <Button
            variant={mode === "join" ? "default" : "outline"}
            size="sm"
            onClick={() => handleSwitchMode("join")}
            className="gap-2"
          >
            <Smartphone className="h-4 w-4" />
            Join
          </Button>
          <Button
            variant={mode === "spectate" ? "default" : "outline"}
            size="sm"
            onClick={() => handleSwitchMode("spectate")}
            className="gap-2"
          >
            <Eye className="h-4 w-4" />
            Spectate
          </Button>
        </div>

        {/* HOST MODE */}
        {mode === "host" && (
          <>
            {/* Room Code */}
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">Room Code</p>
                  <div className="flex items-center justify-center gap-2">
                    {roomCode ? (
                      <>
                        <span className="text-4xl font-mono font-bold tracking-widest">
                          {roomCode}
                        </span>
                        <Button variant="ghost" size="sm" onClick={handleCopyCode}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-2xl text-muted-foreground">Creating...</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Share this code with players
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Players */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Players ({players.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {players.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    Waiting for players to join...
                  </p>
                ) : (
                  <div className="space-y-2">
                    {players.map((player) => (
                      <div
                        key={player.id}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <span className="font-medium">
                          {player.name || player.guestName}
                        </span>
                        {!player.isActive && (
                          <Badge variant="outline">Offline</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Settings */}
            {roomId && <RoomSettings roomId={roomId} isHost={true} />}

            {/* Actions */}
            <Button
              onClick={handleStartGame}
              disabled={players.length < 1 || !roomCode}
              className="w-full"
              size="lg"
            >
              {players.length < 1 ? "Waiting for players..." : "Start Game"}
            </Button>
          </>
        )}

        {/* JOIN MODE */}
        {mode === "join" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-center">Join a Game</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="playerName">Your Name</Label>
                <Input
                  id="playerName"
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  maxLength={20}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="joinCode">Room Code</Label>
                <Input
                  id="joinCode"
                  placeholder="ABCD"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={4}
                  className="text-center text-2xl font-mono tracking-widest"
                />
              </div>
              <Button
                onClick={handleJoinRoom}
                disabled={!joinCode.trim() || !playerName.trim()}
                className="w-full"
                size="lg"
              >
                Join Room
              </Button>
            </CardContent>
          </Card>
        )}

        {/* SPECTATE MODE */}
        {mode === "spectate" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-center">Spectate a Game</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="spectateCode">Room Code</Label>
                <Input
                  id="spectateCode"
                  placeholder="ABCD"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={4}
                  className="text-center text-2xl font-mono tracking-widest"
                />
              </div>
              <Button
                onClick={() => {
                  if (!joinCode.trim()) {
                    toast.error("Please enter a room code");
                    return;
                  }
                  router.push(`/room/${joinCode.toUpperCase()}/host`);
                }}
                disabled={!joinCode.trim()}
                className="w-full"
                size="lg"
              >
                Watch Game
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
