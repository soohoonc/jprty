"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { api } from "@/trpc/react";

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.code as string;

  const { data: results, isLoading, error } = api.game.getGameResults.useQuery(
    { roomCode },
    { staleTime: Infinity } // Results don't change
  );

  const handlePlayAgain = () => {
    router.push(`/room/${roomCode}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-purple-900">
        <div className="text-white text-2xl">Loading results...</div>
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-900 to-purple-900 gap-6">
        <div className="text-white text-2xl">No results found</div>
        <Link href={`/room/${roomCode}`}>
          <Button size="lg">Back to Room</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 p-4">
      <div className="max-w-4xl mx-auto py-8">
        {/* Winner Announcement */}
        {results.winner && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", duration: 0.8 }}
            className="text-center mb-12"
          >
            <h1 className="text-5xl font-extrabold text-yellow-400 mb-4">
              Winner!
            </h1>
            <motion.div
              animate={{
                scale: [1, 1.1, 1],
                rotate: [0, -5, 5, 0]
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                repeatDelay: 2
              }}
              className="inline-block"
            >
              <Card className="bg-gradient-to-br from-yellow-400 to-yellow-600 text-black inline-block">
                <CardContent className="p-8">
                  <h2 className="text-4xl font-bold">{results.winner.name}</h2>
                  <p className="text-3xl mt-2">${results.winner.score.toLocaleString()}</p>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}

        {/* Final Standings */}
        <Card className="bg-white/95 backdrop-blur mb-8">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Final Standings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {results.players.map((player, index) => (
                <motion.div
                  key={player.id}
                  initial={{ x: -50, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className={`flex items-center justify-between p-4 rounded-lg ${
                    index === 0
                      ? "bg-gradient-to-r from-yellow-100 to-yellow-200 border-2 border-yellow-400"
                      : index === 1
                      ? "bg-gradient-to-r from-gray-100 to-gray-200 border-2 border-gray-400"
                      : index === 2
                      ? "bg-gradient-to-r from-orange-100 to-orange-200 border-2 border-orange-400"
                      : "bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className={`text-3xl font-bold ${
                      index === 0 ? "text-yellow-600" :
                      index === 1 ? "text-gray-600" :
                      index === 2 ? "text-orange-600" :
                      "text-gray-400"
                    }`}>
                      #{index + 1}
                    </span>
                    <div>
                      <h3 className="text-xl font-semibold">{player.name}</h3>
                      <div className="text-sm text-gray-600 flex gap-4">
                        <span className="text-green-600">
                          {player.correctAnswers} correct
                        </span>
                        <span className="text-red-600">
                          {player.incorrectAnswers} incorrect
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-bold ${
                      player.score >= 0 ? "text-green-600" : "text-red-600"
                    }`}>
                      ${player.score.toLocaleString()}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-center gap-4">
          <Button
            onClick={handlePlayAgain}
            size="lg"
            className="text-xl px-8 py-6"
          >
            Play Again
          </Button>
          <Link href="/">
            <Button
              variant="outline"
              size="lg"
              className="text-xl px-8 py-6 bg-white/90"
            >
              Back to Home
            </Button>
          </Link>
          <Link href="/leaderboard">
            <Button
              variant="outline"
              size="lg"
              className="text-xl px-8 py-6 bg-white/90"
            >
              Leaderboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
