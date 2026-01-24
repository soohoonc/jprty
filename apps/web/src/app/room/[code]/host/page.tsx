"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useSocket } from "@/lib/socket";
import { useGameState } from "@/lib/use-game-state";
import { ROOM_EVENTS } from "@jprty/shared";
import { Loader2 } from "lucide-react";

export default function HostPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.code as string;
  const { socket, isConnected } = useSocket();
  const hasJoinedRef = useRef(false);

  // Join room as host when socket connects
  useEffect(() => {
    if (!socket || !isConnected) return;
    if (hasJoinedRef.current) return;
    hasJoinedRef.current = true;

    socket.emit(ROOM_EVENTS.JOIN, { roomCode, playerName: "Host", isHost: true });

    // Request current game state after joining (handles refresh case)
    socket.emit(ROOM_EVENTS.GET_STATE, { isHost: true });
  }, [socket, isConnected, roomCode]);

  const {
    gameBoard,
    currentQuestion,
    gameStatus,
    buzzedPlayer,
    playerAnswer,
    answeringPlayerName,
    showAnswer,
    correctAnswer,
    isCorrect,
    isLoading,
    timeRemaining,
    totalTime,
  } = useGameState({
    roomCode,
    isHost: true,
    enabled: isConnected,
    onGameEnd: () => {
      toast.success("Game Over!");
      router.push(`/room/${roomCode}/results`);
    },
    onError: (message) => toast.error(message),
  });

  // Loading state
  if (isLoading || !gameBoard) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-blue-900 p-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-yellow-400 mx-auto" />
          <p className="text-white/70 text-lg">Loading game board...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-900 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4 flex justify-between items-center">
          <Badge variant="outline" className="text-white border-white">
            HOST
          </Badge>
          <Badge variant="secondary">{roomCode}</Badge>
        </div>

        {/* Game Board - Display Only (no interaction) */}
        {gameStatus === "SELECTING" && !currentQuestion && (
          <div className="grid grid-cols-6 gap-2">
            {gameBoard.categories.map((category) => (
              <div key={category} className="space-y-2">
                <div className="bg-blue-800 text-white text-center p-2 text-xs font-semibold uppercase truncate">
                  {category}
                </div>
                {[200, 400, 600, 800, 1000].map((value) => {
                  const questionId = `${category}_${value}`;
                  const isAnswered = gameBoard.answeredQuestions?.has(questionId);

                  return (
                    <div
                      key={questionId}
                      className={`w-full h-16 flex items-center justify-center text-xl font-bold ${
                        isAnswered
                          ? "bg-blue-950 opacity-30"
                          : "bg-blue-700"
                      }`}
                    >
                      {!isAnswered && (
                        <span className="text-yellow-400">${value}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Question Display */}
        {currentQuestion && (
          <Card className="bg-blue-800 border-none">
            <CardContent className="p-8 text-center text-white">
              <div className="mb-4">
                <Badge className="bg-yellow-500 text-black">
                  {currentQuestion.category} - ${currentQuestion.value}
                </Badge>
              </div>

              <p className="text-2xl mb-8">{currentQuestion.clue}</p>

              {gameStatus === "BUZZING" && (
                <div className="space-y-3">
                  <p className="text-yellow-400 text-xl">BUZZER OPEN</p>
                  {/* Buzz countdown bar */}
                  {timeRemaining !== null && totalTime !== null && (
                    <div className="w-full max-w-md mx-auto">
                      <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-yellow-400 transition-all duration-1000 ease-linear"
                          style={{ width: `${(timeRemaining / totalTime) * 100}%` }}
                        />
                      </div>
                      <p className="text-yellow-400/70 text-sm mt-1">{timeRemaining}s</p>
                    </div>
                  )}
                </div>
              )}

              {buzzedPlayer && !playerAnswer && (
                <div className="space-y-3">
                  <p className="text-green-400 text-xl">{buzzedPlayer} buzzed!</p>
                  {/* Answer countdown bar */}
                  {timeRemaining !== null && totalTime !== null && gameStatus === "ANSWERING" && (
                    <div className="w-full max-w-md mx-auto">
                      <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-400 transition-all duration-1000 ease-linear"
                          style={{ width: `${(timeRemaining / totalTime) * 100}%` }}
                        />
                      </div>
                      <p className="text-green-400/70 text-sm mt-1">{timeRemaining}s to answer</p>
                    </div>
                  )}
                </div>
              )}

              {playerAnswer && (
                <div className="mt-4 space-y-2">
                  <p className="text-white text-lg">
                    {answeringPlayerName || "Player"} answered:
                  </p>
                  <p className="text-2xl font-bold">&quot;{playerAnswer}&quot;</p>
                  <p className={`text-3xl font-bold ${isCorrect ? "text-green-400" : "text-red-400"}`}>
                    {isCorrect ? "CORRECT!" : "WRONG!"}
                  </p>
                </div>
              )}

              {showAnswer && (
                <div className="mt-6 pt-6 border-t border-blue-600">
                  <p className="text-gray-400 text-sm">Correct answer:</p>
                  <p className="text-green-400 text-xl">{correctAnswer}</p>

                  {/* Waiting for player to advance indicator */}
                  <div className="mt-6 text-white/50 text-sm">
                    Waiting for player to select next question...
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
