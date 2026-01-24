"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSocket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { GAME_EVENTS, ROOM_EVENTS } from "@jprty/shared";

interface Question {
  id: string;
  clue: string;
  value: number;
  category: string;
}

interface GameBoard {
  categories: string[];
  answeredQuestions: Set<string>;
}

export default function PlayerPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.code as string;
  const { socket } = useSocket();

  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [gameStatus, setGameStatus] = useState<string>("WAITING");
  const [buzzedPlayer, setBuzzedPlayer] = useState<string | null>(null);
  const [playerAnswer, setPlayerAnswer] = useState("");
  const [canBuzz, setCanBuzz] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [answerResult, setAnswerResult] = useState<{
    isCorrect: boolean;
    pointChange: number;
  } | null>(null);
  const [isSelector, setIsSelector] = useState(false);
  const [gameBoard, setGameBoard] = useState<GameBoard | null>(null);

  useEffect(() => {
    if (!socket) return;

    const playerId = localStorage.getItem("playerId");

    // Player already joined from room page - just request current state
    socket.emit(ROOM_EVENTS.GET_STATE);

    socket.on(ROOM_EVENTS.STATE, (data) => {
      // Update board if available
      if (data.board) {
        setGameBoard({
          categories: data.board.categories || [],
          answeredQuestions: new Set(data.board.answeredQuestions || []),
        });
      }

      // Check if this player is the selector
      setIsSelector(data.selectorPlayerId === playerId);

      if (data.phase === "SELECTING") {
        setGameStatus("SELECTING");
        setCurrentQuestion(null);
      } else if (data.phase && data.currentQuestion) {
        setGameStatus(data.phase);
        setCurrentQuestion({
          id: data.currentQuestion.id,
          clue: data.currentQuestion.clue,
          category: data.currentQuestion.id?.split("_")[0] || "Unknown",
          value: data.currentQuestion.value || 0,
        });
      }
    });

    socket.on(ROOM_EVENTS.GAME_STARTED, (data) => {
      if (data.board) {
        setGameBoard({
          categories: data.board.categories || [],
          answeredQuestions: new Set(data.board.answeredQuestions || []),
        });
      }
      // Check if this player is the selector from state
      const isSelectorPlayer = data.state?.selectorPlayerId === playerId;
      setIsSelector(isSelectorPlayer);
      setGameStatus("SELECTING");
    });

    socket.on(GAME_EVENTS.QUESTION_SELECTED, (data) => {
      setCurrentQuestion({
        id: data.question?.id || data.questionId,
        clue: data.question?.clue || `Question for ${data.questionId}`,
        category: data.questionId?.split("_")[0] || "Unknown",
        value: data.value || parseInt(data.questionId?.split("_")[1]) || 0,
      });
      setGameStatus("QUESTION_DISPLAY");
      setShowAnswer(false);
      setBuzzedPlayer(null);
      setPlayerAnswer("");
      setIsMyTurn(false);
      setCanBuzz(false);
      setAnswerResult(null);
    });

    socket.on(GAME_EVENTS.BUZZER_OPEN, () => {
      setGameStatus("BUZZER_OPEN");
      setCanBuzz(true);
    });

    socket.on(GAME_EVENTS.PLAYER_BUZZED, (data) => {
      setBuzzedPlayer(data.playerName || data.playerId);
      setCanBuzz(false);
      setGameStatus("ANSWERING");
      const playerId = localStorage.getItem("playerId");
      setIsMyTurn(data.playerId === playerId);
    });

    socket.on(GAME_EVENTS.ANSWER_RESULT, (data) => {
      setShowAnswer(true);
      setCorrectAnswer(data.correctAnswer);
      setGameStatus("ANSWER_REVEAL");
      setAnswerResult({
        isCorrect: data.isCorrect,
        pointChange: data.pointChange,
      });

      const playerId = localStorage.getItem("playerId");
      if (data.playerId === playerId) {
        if (data.isCorrect) {
          toast.success(`Correct! +${data.pointChange}`);
        } else {
          toast.error(`Wrong! ${data.pointChange}`);
        }
      }
    });

    socket.on(GAME_EVENTS.STATE_UPDATE, (data) => {
      // Update board if available
      if (data.board) {
        setGameBoard({
          categories: data.board.categories || gameBoard?.categories || [],
          answeredQuestions: new Set(data.board.answeredQuestions || []),
        });
      }

      // Check if this player is the selector
      if (data.selectorPlayerId !== undefined) {
        setIsSelector(data.selectorPlayerId === playerId);
      }

      if (data.phase === "SELECTING") {
        setCurrentQuestion(null);
        setGameStatus("SELECTING");
        setShowAnswer(false);
        setBuzzedPlayer(null);
        setIsMyTurn(false);
        setCanBuzz(false);
        setAnswerResult(null);
      }
    });

    socket.on(GAME_EVENTS.GAME_END, () => {
      toast.success("Game Over!");
      router.push(`/room/${roomCode}/results`);
    });

    return () => {
      socket.off(ROOM_EVENTS.STATE);
      socket.off(ROOM_EVENTS.GAME_STARTED);
      socket.off(GAME_EVENTS.QUESTION_SELECTED);
      socket.off(GAME_EVENTS.BUZZER_OPEN);
      socket.off(GAME_EVENTS.PLAYER_BUZZED);
      socket.off(GAME_EVENTS.ANSWER_RESULT);
      socket.off(GAME_EVENTS.STATE_UPDATE);
      socket.off(GAME_EVENTS.GAME_END);
    };
  }, [socket, roomCode, router]);

  const handleBuzz = () => {
    if (!socket || !canBuzz) return;
    socket.emit(GAME_EVENTS.BUZZ);
    setCanBuzz(false);
  };

  const handleSubmitAnswer = () => {
    if (!socket || !playerAnswer.trim()) return;
    socket.emit(GAME_EVENTS.SUBMIT_ANSWER, { answer: playerAnswer });
    setPlayerAnswer("");
    setIsMyTurn(false);
  };

  const handleSelectQuestion = (questionId: string) => {
    if (!socket || !isSelector || gameStatus !== "SELECTING") return;
    socket.emit(GAME_EVENTS.SELECT_QUESTION, { questionId });
  };

  return (
    <div className="min-h-screen bg-blue-900 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <Badge variant="secondary">{roomCode}</Badge>
        </div>

        {/* Selector View - Show board to pick questions */}
        {gameStatus === "SELECTING" && isSelector && gameBoard && !currentQuestion && (
          <div className="space-y-4">
            <Card className="bg-green-900/50 border-green-500">
              <CardContent className="p-4 text-center">
                <p className="text-green-400 font-medium">Your turn to pick a question!</p>
              </CardContent>
            </Card>
            <div className="grid grid-cols-6 gap-1">
              {gameBoard.categories.map((category) => (
                <div key={category} className="space-y-1">
                  <div className="bg-blue-800 text-white text-center p-2 text-xs font-semibold uppercase truncate">
                    {category}
                  </div>
                  {[200, 400, 600, 800, 1000].map((value) => {
                    const questionId = `${category}_${value}`;
                    const isAnswered = gameBoard.answeredQuestions?.has(questionId);

                    return (
                      <button
                        key={questionId}
                        disabled={isAnswered}
                        onClick={() => handleSelectQuestion(questionId)}
                        className={`w-full p-3 text-lg font-bold text-yellow-400 ${
                          isAnswered
                            ? "bg-blue-950 cursor-not-allowed opacity-30"
                            : "bg-blue-700 hover:bg-blue-600 cursor-pointer"
                        }`}
                      >
                        {isAnswered ? "" : `$${value}`}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Waiting State - Not selector */}
        {gameStatus === "SELECTING" && !isSelector && !currentQuestion && (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Waiting for question selection...</p>
            </CardContent>
          </Card>
        )}

        {/* Waiting State - Initial */}
        {gameStatus === "WAITING" && !currentQuestion && (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Waiting for game to start...</p>
            </CardContent>
          </Card>
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
              {gameStatus === "BUZZER_OPEN" && canBuzz && (
                <Button
                  onClick={handleBuzz}
                  size="lg"
                  className="w-full bg-red-600 hover:bg-red-500 text-xl py-8"
                >
                  BUZZ
                </Button>
              )}

              {/* Reading */}
              {gameStatus === "QUESTION_DISPLAY" && (
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

              {/* Result */}
              {answerResult && (
                <div
                  className={`text-center p-4 rounded ${
                    answerResult.isCorrect ? "bg-green-100" : "bg-red-100"
                  }`}
                >
                  <p className="font-bold">
                    {answerResult.isCorrect ? "CORRECT" : "WRONG"}
                  </p>
                  <p>
                    {answerResult.isCorrect ? "+" : ""}
                    {answerResult.pointChange}
                  </p>
                </div>
              )}

              {/* Answer Reveal */}
              {showAnswer && (
                <div className="text-center pt-4 border-t">
                  <p className="text-sm text-muted-foreground">Answer:</p>
                  <p className="text-green-600 font-medium">{correctAnswer}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
