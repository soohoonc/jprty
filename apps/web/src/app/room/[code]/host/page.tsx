"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useSocket } from "@/lib/socket";
import { useGameMachine } from "@/lib/use-game-machine";
import { ROOM_EVENTS } from "@jprty/shared";
import { Loader2, Star } from "lucide-react";

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
    socket.emit(ROOM_EVENTS.GET_STATE, { isHost: true });
  }, [socket, isConnected, roomCode]);

  const {
    // Phase checks
    isSelecting,
    isBuzzing,
    isAnswering,
    isDailyDouble,
    isDailyDoubleAnswer,
    // Game data
    board,
    currentQuestion,
    dailyDoublePlayerName,
    // Buzzer state
    buzzedPlayerName,
    timeRemaining,
    totalTime,
    // Answer state
    lastAnswer,
    showAnswer,
    correctAnswer,
    // Loading
    isLoading,
  } = useGameMachine({
    roomCode,
    isHost: true,
    enabled: isConnected,
    onGameEnd: () => router.push(`/room/${roomCode}/results`),
    onError: (message) => toast.error(message),
  });

  if (isLoading || !board) {
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
        <div className="mb-4 text-center">
          <span className="text-white text-sm font-mono">{roomCode}</span>
        </div>

        {/* Game Board - Display Only */}
        {isSelecting && !currentQuestion && (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${board.categories.length}, minmax(0, 1fr))` }}
          >
            {board.categories.map((category) => (
              <div key={category} className="space-y-2">
                <div className="bg-blue-800 text-white text-center p-2 text-xs font-semibold uppercase truncate">
                  {category}
                </div>
                {(board.values || [200, 400]).map((value) => {
                  const questionId = `${category}_${value}`;
                  const isAnswered = board.answeredQuestions?.has(questionId);

                  return (
                    <div
                      key={questionId}
                      className={`w-full h-16 flex items-center justify-center text-xl font-bold ${
                        isAnswered ? "bg-blue-950 opacity-30" : "bg-blue-700"
                      }`}
                    >
                      {!isAnswered && <span className="text-yellow-400">${value}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Daily Double Display */}
        {isDailyDouble && currentQuestion && (
          <Card className="bg-blue-800 border-none overflow-hidden">
            <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 p-6 flex items-center justify-center gap-4">
              <Star className="h-10 w-10 text-blue-900 fill-blue-900" />
              <span className="text-blue-900 font-bold text-4xl uppercase tracking-wide">Daily Double!</span>
              <Star className="h-10 w-10 text-blue-900 fill-blue-900" />
            </div>
            <CardContent className="p-8 text-center text-white">
              <div className="mb-4">
                <Badge className="bg-blue-950 text-yellow-400">
                  {currentQuestion.category}
                </Badge>
              </div>
              <p className="text-2xl text-yellow-400 mb-4">
                {dailyDoublePlayerName || "Player"} is wagering...
              </p>
            </CardContent>
          </Card>
        )}

        {/* Daily Double Answer Display */}
        {isDailyDoubleAnswer && currentQuestion && (
          <Card className="bg-blue-800 border-none overflow-hidden">
            <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 p-4 flex items-center justify-center gap-3">
              <Star className="h-6 w-6 text-blue-900 fill-blue-900" />
              <span className="text-blue-900 font-bold text-2xl uppercase tracking-wide">Daily Double</span>
              <Star className="h-6 w-6 text-blue-900 fill-blue-900" />
            </div>
            <CardContent className="p-8 text-center text-white">
              <div className="mb-4">
                <Badge className="bg-yellow-500 text-black">
                  {currentQuestion.category} - ${currentQuestion.value}
                </Badge>
              </div>
              <p className="text-2xl mb-8">{currentQuestion.clue}</p>
              <div className="space-y-3">
                <p className="text-green-400 text-xl">{dailyDoublePlayerName || "Player"} is answering...</p>
                {timeRemaining !== null && totalTime !== null && (
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
              {showAnswer && (
                <div className="mt-6 pt-4 border-t border-blue-600 space-y-3">
                  {lastAnswer?.answer && (
                    <p className="text-white/70 text-sm">
                      {lastAnswer.playerName}: &quot;{lastAnswer.answer}&quot;
                      <span className={`ml-2 ${lastAnswer.isCorrect ? "text-green-400" : "text-red-400"}`}>
                        {lastAnswer.isCorrect ? "✓" : "✗"}
                      </span>
                    </p>
                  )}
                  <p className="text-green-400 text-xl">{correctAnswer}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Question Display (Regular flow) */}
        {currentQuestion && !isDailyDouble && !isDailyDoubleAnswer && (
          <Card className="bg-blue-800 border-none">
            <CardContent className="p-8 text-center text-white">
              <div className="mb-4">
                <Badge className="bg-yellow-500 text-black">
                  {currentQuestion.category} - ${currentQuestion.value}
                </Badge>
              </div>

              <p className="text-2xl mb-8">{currentQuestion.clue}</p>

              {isBuzzing && (
                <div className="space-y-3">
                  <p className="text-yellow-400 text-xl">BUZZER OPEN</p>
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

              {buzzedPlayerName && !lastAnswer?.answer && (
                <div className="space-y-3">
                  <p className="text-green-400 text-xl">{buzzedPlayerName} buzzed!</p>
                  {timeRemaining !== null && totalTime !== null && isAnswering && (
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

              {showAnswer && (
                <div className="mt-6 pt-4 border-t border-blue-600 space-y-3">
                  {lastAnswer?.answer && (
                    <p className="text-white/70 text-sm">
                      {lastAnswer.playerName}: &quot;{lastAnswer.answer}&quot;
                      <span className={`ml-2 ${lastAnswer.isCorrect ? "text-green-400" : "text-red-400"}`}>
                        {lastAnswer.isCorrect ? "✓" : "✗"}
                      </span>
                    </p>
                  )}
                  <p className="text-green-400 text-xl">{correctAnswer}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
