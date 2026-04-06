"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/lib/socket";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { RoomSettings } from "@/components/game/room-settings";
import { ROOM_EVENTS } from "@jprty/shared";
import { useRoomRuntime } from "@/lib/use-room-runtime";

export default function Home() {
  const router = useRouter();
  const { socket, isConnected } = useSocket();

  const [joinCode, setJoinCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const joinedSocketId = useRef<string | undefined>(undefined);

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

  const { room } = useRoomRuntime({
    enabled: !!roomCode,
    onPlayerJoined: (player) => {
      toast.info(`${player.name || player.guestName} joined`);
    },
  });

  const players = room?.players ?? [];

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
    if (joinedSocketId.current === socket.id) return;

    joinedSocketId.current = socket.id;
    socket.emit(ROOM_EVENTS.JOIN, { roomCode, playerName: "Host", isHost: true });

    const handleGameStarted = () => {
      router.push(`/room/${roomCode}/host`);
    };

    socket.on(ROOM_EVENTS.GAME_STARTED, handleGameStarted);

    return () => {
      socket.off(ROOM_EVENTS.GAME_STARTED, handleGameStarted);
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
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-yellow-400 text-center py-4 uppercase tracking-wide">JPRTY!</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Column - Room Code & Settings */}
            <div className="space-y-4">
              <div className="bg-blue-800 rounded-lg overflow-hidden">
                <div className="bg-blue-950 px-4 py-2">
                  <p className="text-yellow-400 text-sm font-semibold uppercase tracking-wide">Room Code</p>
                </div>
                <div className="p-6 text-center">
                  {roomCode ? (
                    <span className="text-5xl font-mono font-bold tracking-widest text-white">{roomCode}</span>
                  ) : (
                    <span className="text-2xl text-white/50">Creating...</span>
                  )}
                </div>
              </div>

              {roomId && roomCode && <RoomSettings roomId={roomId} roomCode={roomCode} isHost={true} />}
            </div>

            {/* Right Column - Players & Start */}
            <div className="flex flex-col">
              <div className="bg-blue-800 rounded-lg overflow-hidden flex-1">
                <div className="bg-blue-950 px-4 py-2">
                  <p className="text-yellow-400 text-sm font-semibold uppercase tracking-wide">Players ({players.length})</p>
                </div>
                <div className="p-4">
                  {players.length === 0 ? (
                    <p className="text-white/50 text-center py-4">Waiting for players...</p>
                  ) : (
                    <div className="space-y-2">
                      {players.map((p) => (
                        <div key={p.id} className="flex items-center justify-between p-3 bg-blue-700 rounded">
                          <span className="text-white font-medium">{p.name || p.guestName}</span>
                          {!p.isActive && <Badge className="bg-white/20 text-white/60">Offline</Badge>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <Button
                onClick={handleStartGame}
                disabled={players.length < 1 || !roomCode}
                className="w-full bg-yellow-500 hover:bg-yellow-600 text-blue-900 font-bold text-lg mt-4"
                size="lg"
              >
                Start Game
              </Button>
            </div>
          </div>

          <div className="text-center mt-4">
            <Button variant="link" onClick={() => setViewMode('join')} className="text-white/70 hover:text-white">
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
        <h1 className="text-4xl font-bold text-yellow-400 text-center py-4 uppercase tracking-wide">JPRTY!</h1>

        <div className="bg-blue-800 rounded-lg overflow-hidden">
          <div className="bg-blue-950 px-4 py-2">
            <p className="text-yellow-400 text-sm font-semibold uppercase tracking-wide text-center">Join a Game</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-white/70">Your Name</Label>
              <Input
                placeholder="Enter your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={20}
                className="bg-blue-700 border-blue-600 text-white placeholder:text-white/40"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">Room Code</Label>
              <Input
                placeholder="ABCD"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={4}
                className="text-center text-2xl font-mono tracking-widest bg-blue-700 border-blue-600 text-white placeholder:text-white/40"
              />
            </div>
            <Button
              onClick={handleJoin}
              disabled={!joinCode.trim() || !playerName.trim()}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-blue-900 font-bold"
            >
              Join Room
            </Button>
          </div>
        </div>

        <div className="text-center">
          <Button variant="link" onClick={() => setViewMode('host')} className="text-white/70 hover:text-white">
            Host a game instead
          </Button>
        </div>
      </div>
    </div>
  );
}
