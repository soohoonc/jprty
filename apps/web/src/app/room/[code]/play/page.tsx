"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useSocket } from "@/lib/socket";
import { useGameState } from "@/lib/use-game-state";
import { ROOM_EVENTS } from "@jprty/shared";
import { ChevronLeft, ChevronRight, Loader2, ArrowRight } from "lucide-react";

export default function PlayerPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.code as string;
  const { socket, isConnected } = useSocket();
  const hasJoinedRef = useRef(false);

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerAnswer, setPlayerAnswer] = useState("");
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0);

  // Next question countdown (Netflix-style) for player who answered correctly
  const AUTO_ADVANCE_SECONDS = 8;
  const [nextQuestionCountdown, setNextQuestionCountdown] = useState<number | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Get playerId on mount
  useEffect(() => {
    setPlayerId(localStorage.getItem("playerId"));
  }, []);

  // Join room as player when socket connects
  useEffect(() => {
    if (!socket || !isConnected) return;
    if (hasJoinedRef.current) return;
    hasJoinedRef.current = true;

    const playerName = localStorage.getItem("playerName") || "Guest";
    socket.emit(ROOM_EVENTS.JOIN, { roomCode, playerName });

    // Handle JOINED response to update playerId (in case it changed)
    const handleJoined = (data: { player: { id: string } }) => {
      localStorage.setItem("playerId", data.player.id);
      setPlayerId(data.player.id);
    };

    socket.on(ROOM_EVENTS.JOINED, handleJoined);

    // Request current game state after joining (handles refresh case)
    const storedPlayerId = localStorage.getItem("playerId");
    socket.emit(ROOM_EVENTS.GET_STATE, { playerId: storedPlayerId, isHost: false });

    return () => {
      socket.off(ROOM_EVENTS.JOINED, handleJoined);
    };
  }, [socket, isConnected, roomCode]);

  const {
    gameBoard,
    currentQuestion,
    gameStatus,
    buzzedPlayer,
    canBuzz,
    isMyTurn,
    answerResult,
    isSelector,
    isLoading,
    timeRemaining,
    totalTime,
    showAnswer,
    correctAnswer,
    selectQuestion,
    buzz,
    submitAnswer,
    nextQuestion,
  } = useGameState({
    roomCode,
    playerId,
    enabled: !!playerId && isConnected,
    onGameEnd: () => {
      toast.success("Game Over!");
      router.push(`/room/${roomCode}/results`);
    },
    onError: (message) => toast.error(message),
  });

  const handleBuzz = () => {
    buzz();
  };

  const handleNextQuestion = useCallback(() => {
    nextQuestion();
    setNextQuestionCountdown(null);
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, [nextQuestion]);

  // Start countdown when answer is revealed (REVEALING phase) and this player is the selector
  // Don't start if others can still buzz in
  useEffect(() => {
    if (showAnswer && isSelector && gameStatus === "REVEALING" && nextQuestionCountdown === null) {
      setNextQuestionCountdown(AUTO_ADVANCE_SECONDS);
    }
  }, [showAnswer, isSelector, gameStatus, nextQuestionCountdown]);

  // Countdown timer for next question
  useEffect(() => {
    if (nextQuestionCountdown === null || nextQuestionCountdown <= 0) return;

    countdownRef.current = setInterval(() => {
      setNextQuestionCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [nextQuestionCountdown]);

  // Auto-advance when countdown reaches 0
  useEffect(() => {
    if (nextQuestionCountdown === 0) {
      handleNextQuestion();
    }
  }, [nextQuestionCountdown, handleNextQuestion]);

  // Reset countdown when moving to next question (SELECTING phase)
  useEffect(() => {
    if (gameStatus === "SELECTING") {
      setNextQuestionCountdown(null);
    }
  }, [gameStatus]);

  const handleSubmitAnswer = () => {
    submitAnswer(playerAnswer);
    setPlayerAnswer("");
  };

  const handleSelectQuestion = (questionId: string) => {
    selectQuestion(questionId);
  };

  // Show result toast when answer result comes in for this player
  useEffect(() => {
    if (answerResult?.playerId === playerId) {
      if (answerResult.isCorrect) {
        toast.success(`Correct! +${answerResult.pointChange}`);
      } else {
        toast.error(`Wrong! ${answerResult.pointChange}`);
      }
    }
  }, [answerResult, playerId]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-blue-900 p-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-white mx-auto" />
          <p className="text-white/70">Loading game...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-900 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <span className="text-white text-sm font-mono">{roomCode}</span>
          <span className="text-white/40 text-xs uppercase tracking-wide">
            {gameStatus.replace("_", " ")}
          </span>
        </div>

        {/* Selector View - Show one category at a time */}
        {gameStatus === "SELECTING" && isSelector && gameBoard && !currentQuestion && (
          <div className="space-y-4">
            {/* Category Navigation */}
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentCategoryIndex((prev) =>
                  prev > 0 ? prev - 1 : gameBoard.categories.length - 1
                )}
                className="text-white hover:bg-white/10"
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>

              <div className="flex-1 text-center">
                <p className="text-white/50 text-sm mb-1">
                  {currentCategoryIndex + 1} of {gameBoard.categories.length}
                </p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentCategoryIndex((prev) =>
                  prev < gameBoard.categories.length - 1 ? prev + 1 : 0
                )}
                className="text-white hover:bg-white/10"
              >
                <ChevronRight className="h-8 w-8" />
              </Button>
            </div>

            {/* Single Category Column */}
            <div className="space-y-2">
              <div className="bg-blue-800 text-white text-center p-4 text-lg font-semibold uppercase">
                {gameBoard.categories[currentCategoryIndex]}
              </div>
              {[200, 400, 600, 800, 1000].map((value) => {
                const category = gameBoard.categories[currentCategoryIndex];
                const questionId = `${category}_${value}`;
                const isAnswered = gameBoard.answeredQuestions?.has(questionId);

                return (
                  <button
                    key={questionId}
                    disabled={isAnswered}
                    onClick={() => handleSelectQuestion(questionId)}
                    className={`w-full h-16 flex items-center justify-center text-2xl font-bold text-yellow-400 rounded-lg transition-all ${
                      isAnswered
                        ? "bg-blue-950 cursor-not-allowed opacity-30"
                        : "bg-blue-700 hover:bg-blue-600 active:scale-95 cursor-pointer"
                    }`}
                  >
                    {!isAnswered && `$${value}`}
                  </button>
                );
              })}
            </div>

            {/* Category dots indicator */}
            <div className="flex justify-center gap-2 pt-2">
              {gameBoard.categories.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentCategoryIndex(idx)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    idx === currentCategoryIndex ? "bg-yellow-400 w-4" : "bg-white/30"
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Waiting State - Not selector */}
        {gameStatus === "SELECTING" && !isSelector && !currentQuestion && (
          <div className="flex items-center justify-center py-20">
            <p className="text-white/40 text-sm">Waiting for question selection</p>
          </div>
        )}

        {/* Waiting State - Initial */}
        {gameStatus === "WAITING" && !currentQuestion && (
          <div className="flex items-center justify-center py-20">
            <p className="text-white/40 text-sm">Waiting for game to start</p>
          </div>
        )}

        {/* Question Display */}
        {currentQuestion && (
          <Card>
            <CardContent className="p-6 space-y-6">
              <div className="text-center">
                <Badge>
                  {currentQuestion.category} - ${currentQuestion.value}
                </Badge>
              </div>

              <p className="text-xl text-center">{currentQuestion.clue}</p>

              {/* Buzzer */}
              {gameStatus === "BUZZING" && canBuzz && (
                <div className="space-y-3">
                  <Button
                    onClick={handleBuzz}
                    size="lg"
                    className="w-full bg-red-600 hover:bg-red-500 text-xl py-8"
                  >
                    BUZZ
                  </Button>
                  {/* Buzz countdown bar */}
                  {timeRemaining !== null && totalTime !== null && (
                    <div className="w-full">
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-400 transition-all duration-1000 ease-linear"
                          style={{ width: `${(timeRemaining / totalTime) * 100}%` }}
                        />
                      </div>
                      <p className="text-red-600/70 text-sm mt-1 text-center">{timeRemaining}s</p>
                    </div>
                  )}
                </div>
              )}

              {/* Reading */}
              {gameStatus === "READING" && (
                <p className="text-center text-muted-foreground">
                  Get ready to buzz...
                </p>
              )}

              {/* Someone else buzzed */}
              {buzzedPlayer && !isMyTurn && gameStatus === "ANSWERING" && (
                <p className="text-center">{buzzedPlayer} is answering...</p>
              )}

              {/* Answer Input */}
              {isMyTurn && gameStatus === "ANSWERING" && (
                <div className="space-y-4">
                  <p className="text-center text-green-600 font-medium">
                    You buzzed! Answer:
                  </p>
                  {/* Answer countdown bar */}
                  {timeRemaining !== null && totalTime !== null && (
                    <div className="w-full">
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 transition-all duration-1000 ease-linear"
                          style={{ width: `${(timeRemaining / totalTime) * 100}%` }}
                        />
                      </div>
                      <p className="text-green-600/70 text-sm mt-1 text-center">{timeRemaining}s</p>
                    </div>
                  )}
                  <Input
                    value={playerAnswer}
                    onChange={(e) => setPlayerAnswer(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmitAnswer()}
                    placeholder="Your answer..."
                    autoFocus
                  />
                  <Button
                    onClick={handleSubmitAnswer}
                    className="w-full"
                    disabled={!playerAnswer.trim()}
                  >
                    Submit
                  </Button>
                </div>
              )}

              {/* Brief feedback for the answering player only */}
              {answerResult && answerResult.playerId === playerId && (
                <div
                  className={`text-center p-4 rounded ${
                    answerResult.isCorrect ? "bg-green-100" : "bg-red-100"
                  }`}
                >
                  <p className="font-bold">
                    {answerResult.isCorrect ? "CORRECT" : "WRONG"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {answerResult.isCorrect ? "+" : ""}{answerResult.pointChange} points
                  </p>
                </div>
              )}

              {/* Netflix-style Next Question button for selector (whoever picks next) */}
              {/* Only show when in REVEALING phase - not while others can still buzz */}
              {showAnswer && isSelector && gameStatus === "REVEALING" && (
                <div className="mt-4 p-4 bg-blue-50 rounded text-center">
                  <p className="text-xs text-muted-foreground mb-2">
                    Correct answer: {correctAnswer}
                  </p>
                  <Button
                    onClick={handleNextQuestion}
                    className="relative overflow-hidden bg-blue-600 hover:bg-blue-500 text-white px-6 py-4"
                  >
                    {/* Progress bar background */}
                    {nextQuestionCountdown !== null && nextQuestionCountdown > 0 && (
                      <div
                        className="absolute inset-0 bg-blue-400 transition-all duration-1000 ease-linear"
                        style={{
                          width: `${((AUTO_ADVANCE_SECONDS - nextQuestionCountdown) / AUTO_ADVANCE_SECONDS) * 100}%`,
                        }}
                      />
                    )}
                    <span className="relative flex items-center gap-2">
                      Pick Next Question
                      <ArrowRight className="h-4 w-4" />
                      {nextQuestionCountdown !== null && nextQuestionCountdown > 0 && (
                        <span className="text-sm opacity-70">({nextQuestionCountdown}s)</span>
                      )}
                    </span>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
