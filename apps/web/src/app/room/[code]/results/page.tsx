"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Trophy, Loader2 } from "lucide-react";
import { api } from "@/trpc/react";

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.code as string;

  const { data: results, isLoading, error } = api.game.getGameResults.useQuery(
    { roomCode },
    { staleTime: Infinity }
  );

  const handlePlayAgain = () => {
    router.push(`/room/${roomCode}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-blue-900 p-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-yellow-400 mx-auto" />
          <p className="text-white/70 text-lg">Loading results...</p>
        </div>
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-blue-900 gap-6">
        <div className="text-white text-2xl">No results found</div>
        <Link href={`/room/${roomCode}`}>
          <Button size="lg" className="bg-yellow-500 hover:bg-yellow-600 text-blue-900 font-bold">
            Back to Room
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-900 p-4">
      <div className="max-w-2xl mx-auto py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-yellow-400 uppercase tracking-wide">
            Final Results
          </h1>
        </div>

        {/* Winner Banner */}
        {results.winner && (
          <div className="bg-yellow-500 rounded-lg p-6 mb-8 text-center">
            <Trophy className="h-12 w-12 text-blue-900 mx-auto mb-2" />
            <h2 className="text-3xl font-bold text-blue-900 mb-1">
              {results.winner.name}
            </h2>
            <p className="text-2xl font-bold text-blue-900/80">
              ${results.winner.score.toLocaleString()}
            </p>
          </div>
        )}

        {/* Standings */}
        <div className="bg-blue-800 rounded-lg overflow-hidden mb-8">
          <div className="bg-blue-950 px-4 py-3">
            <h3 className="text-yellow-400 font-semibold uppercase text-sm tracking-wide">
              Final Standings
            </h3>
          </div>
          <div className="divide-y divide-blue-700">
            {results.players.map((player, index) => (
              <div
                key={player.id}
                className={`flex items-center justify-between px-4 py-4 ${
                  index === 0 ? "bg-yellow-500/10" : ""
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className={`text-2xl font-bold w-8 ${
                    index === 0 ? "text-yellow-400" :
                    index === 1 ? "text-gray-300" :
                    index === 2 ? "text-orange-400" :
                    "text-white/40"
                  }`}>
                    {index + 1}
                  </span>
                  <h4 className="text-white font-semibold text-lg">{player.name}</h4>
                </div>
                <p className={`text-xl font-bold ${
                  player.score >= 0 ? "text-yellow-400" : "text-red-400"
                }`}>
                  ${player.score.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row justify-center gap-3">
          <Button
            onClick={handlePlayAgain}
            size="lg"
            className="bg-yellow-500 hover:bg-yellow-600 text-blue-900 font-bold text-lg px-8"
          >
            Play Again
          </Button>
          <Link href="/">
            <Button
              size="lg"
              className="w-full sm:w-auto bg-blue-700 hover:bg-blue-600 text-white font-bold text-lg px-8"
            >
              Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
