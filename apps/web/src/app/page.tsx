"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/lib/socket";
import { useSocketInvalidation } from "@/lib/use-socket-invalidation";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { RoomSettings } from "@/components/game/room-settings";
import { ROOM_EVENTS } from "@jprty/shared";

export default function Home() {
  const router = useRouter();
  const { socket, isConnected } = useSocket();

  const [joinCode, setJoinCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const socketJoined = useRef(false);

  // View mode: null = not yet determined, 'host' or 'join'
  const [viewMode, setViewMode] = useState<'host' | 'join' | null>(null);

  const createRoom = api.game.createRoom.useMutation({
    onSuccess: () => {
      localStorage.setItem("isHost", "true");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Derive room info from mutation result
  const roomCode = createRoom.data?.code ?? null;
  const roomId = createRoom.data?.id ?? null;

  // Get room data from React Query (including players)
  const { data: room } = api.game.getRoom.useQuery(
    { roomCode: roomCode! },
    { enabled: !!roomCode }
  );

  // Socket invalidation for player updates
  useSocketInvalidation({ roomCode: roomCode || "", enabled: !!roomCode });

  // Players from React Query (excludes host)
  const players = room?.players?.filter((p) => !p.userId || p.userId !== room.hostId) || [];

  // Set initial view mode based on screen size (only once on mount)
  useEffect(() => {
    if (viewMode === null) {
      const isMobile = window.innerWidth < 768;
      setViewMode(isMobile ? 'join' : 'host');
    }
  }, [viewMode]);

  // Create room when switching to host mode (if not already created)
  useEffect(() => {
    if (viewMode === 'host' && !createRoom.data && !createRoom.isPending) {
      createRoom.mutate({ name: "Host" });
    }
  }, [viewMode, createRoom.data, createRoom.isPending]);

  // Socket setup for host
  useEffect(() => {
    if (!socket || !isConnected || !roomCode) return;
    if (socketJoined.current) return;

    socketJoined.current = true;
    socket.emit(ROOM_EVENTS.JOIN, { roomCode, playerName: "Host", isHost: true });

    socket.on(ROOM_EVENTS.PLAYER_JOINED, (data) => {
      toast.info(`${data.player.name || data.player.guestName} joined`);
    });

    socket.on(ROOM_EVENTS.GAME_STARTED, () => {
      router.push(`/room/${roomCode}/host`);
    });

    return () => {
      socket.off(ROOM_EVENTS.PLAYER_JOINED);
      socket.off(ROOM_EVENTS.GAME_STARTED);
    };
  }, [socket, isConnected, roomCode, router]);

  const handleJoin = () => {
    if (!joinCode.trim() || !playerName.trim()) {
      toast.error("Please enter your name and room code");
      return;
    }
    localStorage.setItem("playerName", playerName.trim());
    router.push(`/room/${joinCode.toUpperCase()}`);
  };

  const handleStartGame = () => {
    socket?.emit(ROOM_EVENTS.START_GAME);
  };

  const handleCopyCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode);
      toast.success("Copied!");
    }
  };

  // Don't render until we've determined the view mode
  if (viewMode === null) {
    return (
      <div className="min-h-screen bg-blue-900 p-4 flex items-center justify-center">
        <h1 className="text-4xl font-bold text-white">JPRTY!</h1>
      </div>
    );
  }

  // HOST VIEW
  if (viewMode === 'host') {
    return (
      <div className="min-h-screen bg-blue-900 p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <h1 className="text-4xl font-bold text-white text-center py-4">JPRTY!</h1>

          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-sm text-muted-foreground mb-2">Room Code</p>
              {roomCode ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-4xl font-mono font-bold tracking-widest">{roomCode}</span>
                  <Button variant="ghost" size="sm" onClick={handleCopyCode}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <span className="text-2xl text-muted-foreground">Creating...</span>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Players ({players.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {players.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">Waiting for players...</p>
              ) : (
                <div className="space-y-2">
                  {players.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-2 border rounded">
                      <span>{p.name || p.user?.name}</span>
                      {!p.isActive && <Badge variant="outline">Offline</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {roomId && roomCode && <RoomSettings roomId={roomId} roomCode={roomCode} isHost={true} />}

          <Button onClick={handleStartGame} disabled={players.length < 1 || !roomCode} className="w-full" size="lg">
            Start Game
          </Button>

          <div className="text-center">
            <Button variant="link" onClick={() => setViewMode('join')} className="text-white">
              Join a game instead
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // JOIN VIEW
  return (
    <div className="min-h-screen bg-blue-900 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <h1 className="text-4xl font-bold text-white text-center py-4">JPRTY!</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">Join a Game</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Your Name</Label>
              <Input
                placeholder="Enter your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={20}
              />
            </div>
            <div className="space-y-2">
              <Label>Room Code</Label>
              <Input
                placeholder="ABCD"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={4}
                className="text-center text-2xl font-mono tracking-widest"
              />
            </div>
            <Button onClick={handleJoin} disabled={!joinCode.trim() || !playerName.trim()} className="w-full">
              Join Room
            </Button>
          </CardContent>
        </Card>

        <div className="text-center">
          <Button variant="link" onClick={() => setViewMode('host')} className="text-white">
            Host a game instead
          </Button>
        </div>
      </div>
    </div>
  );
}
