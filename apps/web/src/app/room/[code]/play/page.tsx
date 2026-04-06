"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CountdownButton } from "@/components/ui/countdown-button";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { useSocket } from "@/lib/socket";
import { useGameMachine } from "@/lib/use-game-machine";
import { ROOM_EVENTS } from "@jprty/shared";
import { ChevronLeft, ChevronRight, Loader2, Star } from "lucide-react";

export default function PlayerPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.code as string;
  const { socket, isConnected } = useSocket();
  const hasJoinedRef = useRef(false);

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerAnswer, setPlayerAnswer] = useState("");
  const [categoryIdx, setCategoryIdx] = useState(0);
  const [wagerAmount, setWagerAmount] = useState(5);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  // Get playerId on mount
  useEffect(() => {
    setPlayerId(localStorage.getItem("playerId"));
  }, []);

  // Join room
  useEffect(() => {
    if (!socket || !isConnected || hasJoinedRef.current) return;
    hasJoinedRef.current = true;

    const playerName = localStorage.getItem("playerName") || "Guest";
    socket.emit(ROOM_EVENTS.JOIN, { roomCode, playerName });

    const handleJoined = (data: { player: { id: string } }) => {
      localStorage.setItem("playerId", data.player.id);
      setPlayerId(data.player.id);
    };

    socket.on(ROOM_EVENTS.JOINED, handleJoined);
    socket.emit(ROOM_EVENTS.GET_STATE, { playerId: localStorage.getItem("playerId"), isHost: false });

    return () => { socket.off(ROOM_EVENTS.JOINED, handleJoined); };
  }, [socket, isConnected, roomCode]);

  const {
    phase, isSelecting, isReading, isBuzzing, isAnswering, isRevealing,
    isDailyDouble, isDailyDoubleAnswer, isDailyDoublePlayer, dailyDoublePlayerName,
    isMyTurn, isSelector, selectorPlayerName, canBuzz,
    board, currentQuestion, buzzedPlayerName, timeRemaining, totalTime,
    lastAnswer, correctAnswer, myScore, maxWager,
    isLoading,
    selectQuestion, buzz, submitAnswer, submitWager, nextQuestion,
  } = useGameMachine({
    roomCode,
    playerId,
    enabled: !!playerId && isConnected,
    onGameEnd: () => router.push(`/room/${roomCode}/results`),
    onError: (msg) => toast.error(msg),
  });

  const handleSubmit = () => { submitAnswer(playerAnswer); setPlayerAnswer(""); };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-900 p-4">
        <Loader2 className="h-8 w-8 animate-spin text-yellow-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-900 p-4 pb-20">
      <div className="max-w-2xl mx-auto">
        <div className="mb-4 text-center">
          <span className="text-white text-sm font-mono">{roomCode}</span>
        </div>

        {/* Category Picker (Selector only) */}
        {isSelecting && isSelector && board && !currentQuestion && (
          <div className="space-y-4">
            <div className="bg-blue-800 text-white flex items-center justify-between p-2">
              <Button variant="ghost" size="icon" onClick={() => {
                const newIdx = categoryIdx > 0 ? categoryIdx - 1 : board.categories.length - 1;
                isScrollingRef.current = true;
                setCategoryIdx(newIdx);
                scrollContainerRef.current?.children[newIdx]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
                setTimeout(() => { isScrollingRef.current = false; }, 300);
              }} className="text-white hover:bg-white/10 h-10 w-10">
                <ChevronLeft className="h-6 w-6" />
              </Button>
              <span className="text-lg font-semibold uppercase">{board.categories[categoryIdx]}</span>
              <Button variant="ghost" size="icon" onClick={() => {
                const newIdx = categoryIdx < board.categories.length - 1 ? categoryIdx + 1 : 0;
                isScrollingRef.current = true;
                setCategoryIdx(newIdx);
                scrollContainerRef.current?.children[newIdx]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
                setTimeout(() => { isScrollingRef.current = false; }, 300);
              }} className="text-white hover:bg-white/10 h-10 w-10">
                <ChevronRight className="h-6 w-6" />
              </Button>
            </div>

            <div
              ref={scrollContainerRef}
              className="flex snap-x snap-mandatory overflow-x-auto gap-4"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              onScroll={(e) => {
                if (isScrollingRef.current) return;
                const container = e.currentTarget;
                const scrollLeft = container.scrollLeft;
                const cardWidth = container.offsetWidth;
                const newIdx = Math.round(scrollLeft / cardWidth);
                if (newIdx !== categoryIdx && newIdx >= 0 && newIdx < board.categories.length) {
                  setCategoryIdx(newIdx);
                }
              }}
            >
              {board.categories.map((category, catIdx) => (
                <div key={category} className="flex-none w-full snap-start space-y-2">
                  {board.values.map((value) => {
                    const cellKey = `${category}_${value}`;
                    const qid = board.questionIds[cellKey];
                    const answered = qid ? board.answeredQuestions?.has(qid) : true;
                    return (
                      <button
                        key={cellKey}
                        disabled={answered || catIdx !== categoryIdx || !qid}
                        onClick={() => qid && selectQuestion(qid)}
                        className={`w-full h-16 flex items-center justify-center text-2xl font-bold text-yellow-400 rounded-lg transition-all ${
                          answered ? "bg-blue-950 cursor-not-allowed opacity-30" : "bg-blue-700 hover:bg-blue-600 active:scale-95"
                        }`}
                      >
                        {!answered && `$${value}`}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex justify-center gap-2 pt-2">
              {board.categories.map((_, i) => (
                <button key={i} onClick={() => {
                  isScrollingRef.current = true;
                  setCategoryIdx(i);
                  scrollContainerRef.current?.children[i]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
                  setTimeout(() => { isScrollingRef.current = false; }, 300);
                }} className={`w-2 h-2 rounded-full transition-all ${i === categoryIdx ? "bg-yellow-400 w-4" : "bg-white/30"}`} />
              ))}
            </div>
          </div>
        )}

        {/* Waiting states */}
        {isSelecting && !isSelector && !currentQuestion && (
          <Card className="bg-blue-800 border-none shadow-lg">
            <CardContent className="p-8 text-center space-y-3">
              <p className="text-yellow-400 font-bold text-2xl">
                {selectorPlayerName || "Player"} is choosing
              </p>
              <p className="text-white/50">Get ready to buzz!</p>
            </CardContent>
          </Card>
        )}
        {phase === "WAITING" && !currentQuestion && (
          <Card className="bg-blue-800 border-none shadow-lg">
            <CardContent className="p-8 text-center space-y-3">
              <p className="text-yellow-400 font-bold text-2xl">
                Waiting for Host
              </p>
              <p className="text-white/50">The game will begin shortly</p>
            </CardContent>
          </Card>
        )}

        {/* Daily Double - Wager Phase */}
        {isDailyDouble && (
          <Card className="bg-blue-800 border-none shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 p-4 flex items-center justify-center gap-3">
              <Star className="h-8 w-8 text-blue-900 fill-blue-900" />
              <span className="text-blue-900 font-bold text-2xl uppercase tracking-wide">Daily Double!</span>
              <Star className="h-8 w-8 text-blue-900 fill-blue-900" />
            </div>
            <CardContent className="p-6 space-y-6">
              {currentQuestion && (
                <div className="text-center">
                  <span className="inline-block bg-blue-950 text-yellow-400 font-bold px-4 py-1 rounded text-sm uppercase tracking-wide">
                    {currentQuestion.category}
                  </span>
                </div>
              )}

              {isDailyDoublePlayer ? (
                <div className="space-y-6">
                  <p className="text-white text-center text-lg">Enter your wager:</p>
                  <div className="space-y-4">
                    <div className="text-center">
                      <span className="text-yellow-400 text-4xl font-bold">${wagerAmount}</span>
                    </div>
                    <Slider
                      value={[wagerAmount]}
                      onValueChange={(v) => setWagerAmount(v[0]!)}
                      min={5}
                      max={maxWager || 1000}
                      step={5}
                      className="w-full"
                    />
                    <div className="flex justify-between text-white/60 text-sm">
                      <span>$5</span>
                      <span>${maxWager || 1000}</span>
                    </div>
                  </div>
                  <Button
                    onClick={() => submitWager(wagerAmount)}
                    className="w-full bg-yellow-500 hover:bg-yellow-400 text-blue-900 font-bold py-6 text-xl"
                  >
                    Wager ${wagerAmount}
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-yellow-400 font-bold text-2xl mb-2">
                    {dailyDoublePlayerName || "Player"} hit a Daily Double!
                  </p>
                  <p className="text-white/60">Waiting for wager...</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Daily Double - Answer Phase */}
        {isDailyDoubleAnswer && (
          <Card className="bg-blue-800 border-none shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 p-3 flex items-center justify-center gap-2">
              <Star className="h-5 w-5 text-blue-900 fill-blue-900" />
              <span className="text-blue-900 font-bold text-lg uppercase tracking-wide">Daily Double</span>
              <Star className="h-5 w-5 text-blue-900 fill-blue-900" />
            </div>
            <CardContent className="p-6 space-y-6">
              {currentQuestion && (
                <>
                  <div className="text-center">
                    <span className="inline-block bg-yellow-500 text-blue-900 font-bold px-4 py-1 rounded text-sm uppercase tracking-wide">
                      {currentQuestion.category} - ${currentQuestion.value}
                    </span>
                  </div>
                  <p className="text-xl text-center text-white leading-relaxed">{currentQuestion.clue}</p>
                </>
              )}

              {isDailyDoublePlayer ? (
                <div className="space-y-4">
                  <p className="text-center text-yellow-400 font-bold text-lg">Your answer:</p>
                  <Input
                    value={playerAnswer}
                    onChange={(e) => setPlayerAnswer(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                    placeholder="What is..."
                    autoFocus
                    className="bg-blue-950 border-blue-600 text-white placeholder:text-white/40 text-lg py-6"
                  />
                  <CountdownButton
                    onClick={handleSubmit}
                    timeRemaining={timeRemaining ?? 0}
                    totalTime={totalTime ?? 1}
                    progressColor="bg-yellow-400"
                    className="w-full bg-yellow-500 hover:bg-yellow-400 text-blue-900 font-bold py-4"
                  >
                    Submit
                  </CountdownButton>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-yellow-400 font-medium">
                    {dailyDoublePlayerName || "Player"} is answering...
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Question Display (Regular flow - not Daily Double) */}
        {currentQuestion && !isDailyDouble && !isDailyDoubleAnswer && (
          <Card className="bg-blue-800 border-none shadow-lg">
            <CardContent className="p-6 space-y-6">
              <div className="text-center">
                <span className="inline-block bg-yellow-500 text-blue-900 font-bold px-4 py-1 rounded text-sm uppercase tracking-wide">
                  {currentQuestion.category} - ${currentQuestion.value}
                </span>
              </div>

              <p className="text-xl text-center text-white leading-relaxed">{currentQuestion.clue}</p>

              {/* Buzzer */}
              {isBuzzing && canBuzz && (
                <CountdownButton
                  onClick={buzz}
                  timeRemaining={timeRemaining ?? 0}
                  totalTime={totalTime ?? 1}
                  progressColor="bg-red-400"
                  className="w-full bg-red-600 hover:bg-red-500 text-white text-xl py-8 font-bold"
                >
                  BUZZ
                </CountdownButton>
              )}

              {isReading && <p className="text-center text-white/60">Get ready to buzz...</p>}

              {buzzedPlayerName && !isMyTurn && isAnswering && (
                <p className="text-center text-yellow-400 font-medium">{buzzedPlayerName} is answering...</p>
              )}

              {/* Answer Input */}
              {isMyTurn && isAnswering && (
                <div className="space-y-4">
                  <p className="text-center text-yellow-400 font-bold text-lg">You buzzed! Answer:</p>
                  <Input
                    value={playerAnswer}
                    onChange={(e) => setPlayerAnswer(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                    placeholder="What is..."
                    autoFocus
                    className="bg-blue-950 border-blue-600 text-white placeholder:text-white/40 text-lg py-6"
                  />
                  <CountdownButton
                    onClick={handleSubmit}
                    timeRemaining={timeRemaining ?? 0}
                    totalTime={totalTime ?? 1}
                    progressColor="bg-yellow-400"
                    className="w-full bg-yellow-500 hover:bg-yellow-400 text-blue-900 font-bold py-4"
                  >
                    Submit
                  </CountdownButton>
                </div>
              )}

              {/* Result feedback */}
              {isRevealing && lastAnswer && (
                <div className="text-center space-y-2">
                  {lastAnswer.playerId === playerId && (
                    <p className="text-white/60 text-sm">
                      You answered: &quot;{lastAnswer.answer}&quot;
                      <span className={`ml-2 ${lastAnswer.isCorrect ? "text-green-400" : "text-red-400"}`}>
                        {lastAnswer.isCorrect ? "✓" : "✗"}
                      </span>
                    </p>
                  )}
                  <p className="text-yellow-400 text-xl font-semibold">{correctAnswer}</p>
                </div>
              )}

              {/* Reveal answer when no one answered (timeout) */}
              {isRevealing && !lastAnswer && correctAnswer && (
                <div className="text-center space-y-2">
                  <p className="text-white/50 text-sm">Time&apos;s up</p>
                  <p className="text-yellow-400 text-xl font-semibold">{correctAnswer}</p>
                </div>
              )}

              {/* Next Question button - only for selector */}
              {isRevealing && isSelector && (
                <div className="mt-4 text-center">
                  <CountdownButton
                    onClick={nextQuestion}
                    seconds={8}
                    progressColor="bg-yellow-400"
                    className="bg-yellow-500 hover:bg-yellow-400 text-blue-900 font-bold px-8 py-4"
                  >
                    Pick Next Question
                  </CountdownButton>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Score Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-blue-950/95 backdrop-blur border-t border-yellow-500/20 py-4">
        <div className="text-center">
          <p className="text-white/40 text-xs uppercase tracking-widest mb-1">Your Score</p>
          <span className={`text-3xl font-bold ${myScore >= 0 ? "text-yellow-400" : "text-red-400"}`}>
            {myScore < 0 ? "-" : ""}${Math.abs(myScore).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
