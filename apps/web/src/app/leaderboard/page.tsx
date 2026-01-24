"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/trpc/react";
import { motion } from "framer-motion";

type Period = "DAILY" | "WEEKLY" | "MONTHLY" | "ALL_TIME";

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<Period>("ALL_TIME");

  const { data: entries, isLoading, error } = api.game.getLeaderboard.useQuery(
    { period, limit: 50 },
    { staleTime: 5 * 60 * 1000 } // Cache for 5 minutes
  );

  const getRankStyle = (rank: number) => {
    if (rank === 1) return "bg-gradient-to-r from-yellow-100 to-yellow-200 border-2 border-yellow-400";
    if (rank === 2) return "bg-gradient-to-r from-gray-100 to-gray-200 border-2 border-gray-400";
    if (rank === 3) return "bg-gradient-to-r from-orange-100 to-orange-200 border-2 border-orange-400";
    return "bg-white hover:bg-gray-50";
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return "text-yellow-600";
    if (rank === 2) return "text-gray-500";
    if (rank === 3) return "text-orange-600";
    return "text-gray-400";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 p-4">
      <div className="max-w-4xl mx-auto py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-extrabold text-white mb-4">Leaderboard</h1>
          <p className="text-xl text-white/80">See who&apos;s on top!</p>
        </div>

        {/* Period Tabs */}
        <Card className="bg-white/95 backdrop-blur">
          <CardHeader>
            <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)} className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="DAILY">Today</TabsTrigger>
                <TabsTrigger value="WEEKLY">This Week</TabsTrigger>
                <TabsTrigger value="MONTHLY">This Month</TabsTrigger>
                <TabsTrigger value="ALL_TIME">All Time</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="text-center py-12 text-gray-500">
                Loading leaderboard...
              </div>
            )}

            {error && (
              <div className="text-center py-12 text-red-500">
                Failed to load leaderboard. Please try again later.
              </div>
            )}

            {!isLoading && !error && entries && entries.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500 text-xl mb-4">No entries yet!</p>
                <p className="text-gray-400">Play a game to get on the leaderboard.</p>
              </div>
            )}

            {!isLoading && entries && entries.length > 0 && (
              <div className="space-y-3">
                {entries.map((entry, index) => (
                  <motion.div
                    key={entry.id}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: index * 0.03 }}
                    className={`flex items-center justify-between p-4 rounded-lg transition-colors ${getRankStyle(entry.rank)}`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Rank */}
                      <span className={`text-2xl font-bold w-12 ${getRankBadge(entry.rank)}`}>
                        #{entry.rank}
                      </span>

                      {/* Player Info */}
                      <div className="flex items-center gap-3">
                        {entry.user?.image && entry.user ? (
                          <img
                            src={entry.user.image}
                            alt={entry.user.name ?? "Player"}
                            className="w-10 h-10 rounded-full"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold">
                            {(entry.user?.name?.[0] || "?").toUpperCase()}
                          </div>
                        )}
                        <div>
                          <h3 className="font-semibold text-lg">
                            {entry.user?.name || "Anonymous"}
                          </h3>
                          <p className="text-sm text-gray-500">
                            {entry.gamesWon} {entry.gamesWon === 1 ? "win" : "wins"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Score */}
                    <div className="text-right">
                      <p className="text-2xl font-bold text-blue-600">
                        {entry.score.toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-500">points</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Back Button */}
        <div className="flex justify-center mt-8">
          <Link href="/">
            <Button
              size="lg"
              variant="outline"
              className="text-xl px-8 py-6 bg-white/90"
            >
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
