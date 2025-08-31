"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSocket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import Countdown from "react-countdown";

interface Question {
  id: string;
  question: string;
  value: number;
  category: string;
}

interface BoardCell {
  question: Question;
  isAnswered: boolean;
}

interface GameBoard {
  categories: string[];
  questions: Map<string, Question[]>;
  answeredQuestions: Set<string>;
}

export default function GamePlayPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.code as string;
  const { socket } = useSocket();

  const [gameBoard, setGameBoard] = useState<GameBoard | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [gameStatus, setGameStatus] = useState<string>("SELECTING");
  const [buzzedPlayer, setBuzzedPlayer] = useState<string | null>(null);
  const [playerAnswer, setPlayerAnswer] = useState("");
  const [canBuzz, setCanBuzz] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [isMyTurn, setIsMyTurn] = useState(false);

  useEffect(() => {
    if (!socket) return;

    socket.on("game-started", (data) => {
      setGameBoard(data.board);
      setGameStatus("SELECTING");
    });

    socket.on("question-selected", (data) => {
      setCurrentQuestion(data.question);
      setGameStatus("QUESTION_DISPLAY");
      setShowAnswer(false);
      setBuzzedPlayer(null);
      setPlayerAnswer("");
    });

    socket.on("buzzer-open", () => {
      setGameStatus("BUZZER_OPEN");
      setCanBuzz(true);
    });

    socket.on("player-buzzed", (data) => {
      setBuzzedPlayer(data.playerName);
      setCanBuzz(false);
      setGameStatus("ANSWERING");
      // Check if it's the current player's turn
      const playerId = localStorage.getItem("playerId");
      setIsMyTurn(data.playerId === playerId);
    });

    socket.on("answer-submitted", (data) => {
      setShowAnswer(true);
      setCorrectAnswer(data.correctAnswer);
      setGameStatus("ANSWER_REVEAL");
      
      if (data.isCorrect) {
        toast.success(`${data.playerName} got it right! +${data.points} points`);
      } else {
        toast.error(`${data.playerName} got it wrong! ${data.points} points`);
      }
    });

    socket.on("ready-for-next-question", () => {
      setCurrentQuestion(null);
      setGameStatus("SELECTING");
      setShowAnswer(false);
      setBuzzedPlayer(null);
    });

    socket.on("game-ended", (data) => {
      toast.success(`Game Over! Winner: ${data.winner.name || data.winner.guestName}`);
      router.push(`/room/${roomCode}/results`);
    });

    return () => {
      socket.off("game-started");
      socket.off("question-selected");
      socket.off("buzzer-open");
      socket.off("player-buzzed");
      socket.off("answer-submitted");
      socket.off("ready-for-next-question");
      socket.off("game-ended");
    };
  }, [socket, roomCode, router]);

  const handleSelectQuestion = (questionId: string) => {
    if (!socket || gameStatus !== "SELECTING") return;
    socket.emit("select-question", { questionId });
  };

  const handleBuzz = () => {
    if (!socket || !canBuzz) return;
    socket.emit("buzz");
    setCanBuzz(false);
  };

  const handleSubmitAnswer = () => {
    if (!socket || !playerAnswer.trim()) return;
    socket.emit("submit-answer", { answer: playerAnswer });
    setPlayerAnswer("");
    setIsMyTurn(false);
  };

  if (!gameBoard) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-purple-900">
        <div className="text-white text-2xl">Loading game...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Game Board */}
        {gameStatus === "SELECTING" && !currentQuestion && (
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white text-center mb-6">
              Select a Question
            </h2>
            <div className="grid grid-cols-6 gap-4">
              {gameBoard.categories.map((category, colIndex) => (
                <div key={category} className="space-y-3">
                  <Card className="bg-blue-800 text-white p-3">
                    <h3 className="text-center font-bold text-sm uppercase">
                      {category}
                    </h3>
                  </Card>
                  {[200, 400, 600, 800, 1000].map((value, rowIndex) => {
                    const questionId = `${category}_${value}`;
                    const isAnswered = gameBoard.answeredQuestions?.has(questionId);
                    
                    return (
                      <Card
                        key={questionId}
                        className={`
                          ${isAnswered 
                            ? "bg-gray-600 cursor-not-allowed" 
                            : "bg-blue-600 hover:bg-blue-500 cursor-pointer"
                          } 
                          text-white transition-colors
                        `}
                        onClick={() => !isAnswered && handleSelectQuestion(questionId)}
                      >
                        <CardContent className="p-4">
                          <div className="text-center text-2xl font-bold">
                            {isAnswered ? "" : `$${value}`}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Question Display */}
        <AnimatePresence>
          {currentQuestion && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="flex flex-col items-center justify-center min-h-[60vh]"
            >
              <Card className="bg-white/95 backdrop-blur max-w-4xl w-full">
                <CardContent className="p-12">
                  <div className="text-center mb-6">
                    <Badge className="text-lg px-4 py-2 mb-4">
                      {currentQuestion.category} - ${currentQuestion.value}
                    </Badge>
                  </div>
                  
                  <h2 className="text-3xl font-bold text-center mb-8">
                    {currentQuestion.question}
                  </h2>

                  {/* Buzzer */}
                  {gameStatus === "BUZZER_OPEN" && canBuzz && (
                    <div className="flex justify-center">
                      <Button
                        onClick={handleBuzz}
                        size="lg"
                        className="px-12 py-8 text-2xl bg-red-600 hover:bg-red-500"
                      >
                        BUZZ IN!
                      </Button>
                    </div>
                  )}

                  {/* Buzzed Player */}
                  {buzzedPlayer && (
                    <div className="text-center">
                      <p className="text-2xl font-semibold mb-4">
                        {buzzedPlayer} buzzed in!
                      </p>
                    </div>
                  )}

                  {/* Answer Input */}
                  {isMyTurn && gameStatus === "ANSWERING" && (
                    <div className="space-y-4">
                      <input
                        type="text"
                        value={playerAnswer}
                        onChange={(e) => setPlayerAnswer(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && handleSubmitAnswer()}
                        placeholder="What is your answer?"
                        className="w-full px-4 py-3 text-xl border rounded-lg"
                        autoFocus
                      />
                      <Button
                        onClick={handleSubmitAnswer}
                        className="w-full text-lg py-6"
                        size="lg"
                      >
                        Submit Answer
                      </Button>
                    </div>
                  )}

                  {/* Answer Reveal */}
                  {showAnswer && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center mt-8"
                    >
                      <p className="text-xl mb-2">Correct Answer:</p>
                      <p className="text-3xl font-bold text-green-600">
                        {correctAnswer}
                      </p>
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}