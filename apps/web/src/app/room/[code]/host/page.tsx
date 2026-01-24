"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSocket } from "@/lib/socket";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { GAME_EVENTS, ROOM_EVENTS } from "@jprty/shared";

interface Question {
  id: string;
  clue: string;
  answer?: string;
  value: number;
  category: string;
}

interface GameBoard {
  categories: string[];
  answeredQuestions: Set<string>;
}

export default function HostPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.code as string;
  const { socket } = useSocket();

  const [gameBoard, setGameBoard] = useState<GameBoard | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [gameStatus, setGameStatus] = useState<string>("SELECTING");
  const [buzzedPlayer, setBuzzedPlayer] = useState<string | null>(null);
  const [playerAnswer, setPlayerAnswer] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  useEffect(() => {
    if (!socket) return;

    // Host already joined from lobby - request current state with host flag
    socket.emit(ROOM_EVENTS.GET_STATE, { isHost: true });

    socket.on(ROOM_EVENTS.STATE, (data) => {
      if (data.board) {
        setGameBoard({
          ...data.board,
          answeredQuestions: new Set(data.board.answeredQuestions || []),
        });
        setGameStatus(data.phase || "SELECTING");
      }
    });

    socket.on(ROOM_EVENTS.GAME_STARTED, (data) => {
      if (data.board) {
        setGameBoard({
          ...data.board,
          answeredQuestions: new Set(data.board.answeredQuestions || []),
        });
      }
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
      setPlayerAnswer(null);
      setIsCorrect(null);
    });

    socket.on(GAME_EVENTS.BUZZER_OPEN, () => {
      setGameStatus("BUZZER_OPEN");
    });

    socket.on(GAME_EVENTS.PLAYER_BUZZED, (data) => {
      setBuzzedPlayer(data.playerName || data.playerId);
      setGameStatus("ANSWERING");
    });

    socket.on(GAME_EVENTS.ANSWER_RESULT, (data) => {
      setPlayerAnswer(data.answer);
      setShowAnswer(true);
      setCorrectAnswer(data.correctAnswer);
      setIsCorrect(data.isCorrect);
      setGameStatus("ANSWER_REVEAL");

      if (data.isCorrect) {
        toast.success(`Correct! +${data.pointChange}`);
      } else {
        toast.error(`Wrong! ${data.pointChange}`);
      }
    });

    socket.on(GAME_EVENTS.STATE_UPDATE, (data) => {
      if (data.phase === "SELECTING") {
        setCurrentQuestion(null);
        setGameStatus("SELECTING");
        setShowAnswer(false);
        setBuzzedPlayer(null);
        setPlayerAnswer(null);
        setIsCorrect(null);

        if (data.board) {
          setGameBoard({
            categories: data.board.categories || gameBoard?.categories || [],
            answeredQuestions: new Set(data.board.answeredQuestions || []),
          });
        }
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
  }, [socket, roomCode, router, gameBoard?.categories]);

  const handleSelectQuestion = (questionId: string) => {
    if (!socket || gameStatus !== "SELECTING") return;
    socket.emit(GAME_EVENTS.SELECT_QUESTION, { questionId });
  };

  if (!gameBoard) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading game...</p>
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

        {/* Game Board */}
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
                    <button
                      key={questionId}
                      disabled={isAnswered}
                      onClick={() => handleSelectQuestion(questionId)}
                      className={`w-full p-4 text-xl font-bold text-yellow-400 ${
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

              {gameStatus === "BUZZER_OPEN" && (
                <p className="text-yellow-400 text-xl">BUZZER OPEN</p>
              )}

              {buzzedPlayer && (
                <p className="text-green-400 text-xl">{buzzedPlayer} buzzed!</p>
              )}

              {playerAnswer && (
                <div className="mt-4">
                  <p className="text-gray-300">Answered: "{playerAnswer}"</p>
                  <p className={isCorrect ? "text-green-400" : "text-red-400"}>
                    {isCorrect ? "CORRECT" : "WRONG"}
                  </p>
                </div>
              )}

              {showAnswer && (
                <div className="mt-6 pt-6 border-t border-blue-600">
                  <p className="text-gray-400 text-sm">Correct answer:</p>
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
