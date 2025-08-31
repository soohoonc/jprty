"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { toast } from "sonner";

export default function GameLobby() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  const createRoomMutation = api.game.createRoom.useMutation({
    onSuccess: (room) => {
      toast.success(`Room created! Code: ${room.code}`);
      router.push(`/room/${room.code}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const joinRoomMutation = api.game.joinRoom.useMutation({
    onSuccess: () => {
      router.push(`/room/${roomCode.toUpperCase()}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleCreateRoom = async () => {
    if (!playerName.trim()) {
      toast.error("Please enter your name");
      return;
    }

    setIsCreatingRoom(true);
    createRoomMutation.mutate({ name: playerName });
  };

  const handleJoinRoom = async () => {
    if (!playerName.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (!roomCode.trim() || roomCode.length !== 6) {
      toast.error("Please enter a valid 6-character room code");
      return;
    }

    joinRoomMutation.mutate({
      roomCode: roomCode.toUpperCase(),
      playerName,
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-purple-900 p-4">
      <div className="w-full max-w-4xl">
        <h1 className="text-6xl font-bold text-white text-center mb-12">
          JPRTY!
        </h1>
        
        <div className="grid md:grid-cols-2 gap-8">
          {/* Create Room Card */}
          <Card className="bg-white/95 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-2xl text-center">Host a Game</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Enter your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="text-lg"
                maxLength={20}
              />
              <Button
                onClick={handleCreateRoom}
                disabled={isCreatingRoom || createRoomMutation.isPending}
                className="w-full text-lg py-6"
                size="lg"
              >
                {createRoomMutation.isPending ? "Creating..." : "Create Room"}
              </Button>
            </CardContent>
          </Card>

          {/* Join Room Card */}
          <Card className="bg-white/95 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-2xl text-center">Join a Game</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Enter your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="text-lg"
                maxLength={20}
              />
              <Input
                placeholder="Room code (6 characters)"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                className="text-lg font-mono tracking-wider"
                maxLength={6}
              />
              <Button
                onClick={handleJoinRoom}
                disabled={joinRoomMutation.isPending}
                className="w-full text-lg py-6"
                size="lg"
              >
                {joinRoomMutation.isPending ? "Joining..." : "Join Room"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}