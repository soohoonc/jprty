"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ScoreDisplayProps {
  score: number;
  playerName: string;
  isCurrentPlayer?: boolean;
  rank?: number;
  showChange?: boolean;
  className?: string;
}

export function ScoreDisplay({
  score,
  playerName,
  isCurrentPlayer = false,
  rank,
  showChange = true,
  className = "",
}: ScoreDisplayProps) {
  const [displayScore, setDisplayScore] = useState(score);
  const [change, setChange] = useState<number | null>(null);

  useEffect(() => {
    if (score !== displayScore && showChange) {
      setChange(score - displayScore);
      // Clear change after animation
      const timer = setTimeout(() => setChange(null), 2000);
      return () => clearTimeout(timer);
    }
    setDisplayScore(score);
  }, [score, displayScore, showChange]);

  const getRankColor = (r: number) => {
    if (r === 1) return "text-yellow-500";
    if (r === 2) return "text-gray-400";
    if (r === 3) return "text-orange-400";
    return "text-gray-600";
  };

  return (
    <div
      className={`relative flex items-center gap-3 p-3 rounded-lg ${
        isCurrentPlayer ? "bg-blue-50 border-2 border-blue-300" : "bg-gray-50"
      } ${className}`}
    >
      {/* Rank */}
      {rank !== undefined && (
        <span className={`text-2xl font-bold ${getRankColor(rank)}`}>
          #{rank}
        </span>
      )}

      {/* Player info */}
      <div className="flex-1">
        <div className="font-semibold flex items-center gap-2">
          {playerName}
          {isCurrentPlayer && (
            <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded">
              You
            </span>
          )}
        </div>
      </div>

      {/* Score */}
      <div className="relative">
        <motion.div
          className={`text-2xl font-bold ${
            score >= 0 ? "text-green-600" : "text-red-600"
          }`}
          key={displayScore}
          initial={{ scale: 1 }}
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 0.3 }}
        >
          ${displayScore.toLocaleString()}
        </motion.div>

        {/* Score change indicator */}
        <AnimatePresence>
          {change !== null && (
            <motion.div
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: 1, y: -20 }}
              exit={{ opacity: 0, y: -40 }}
              className={`absolute -top-2 right-0 text-lg font-bold ${
                change >= 0 ? "text-green-500" : "text-red-500"
              }`}
            >
              {change >= 0 ? "+" : ""}
              {change}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface ScoreboardProps {
  scores: Array<{
    playerId: string;
    playerName: string;
    score: number;
  }>;
  currentPlayerId?: string;
  className?: string;
}

export function Scoreboard({
  scores,
  currentPlayerId,
  className = "",
}: ScoreboardProps) {
  // Sort by score descending
  const sortedScores = [...scores].sort((a, b) => b.score - a.score);

  return (
    <div className={`space-y-2 ${className}`}>
      {sortedScores.map((player, index) => (
        <ScoreDisplay
          key={player.playerId}
          score={player.score}
          playerName={player.playerName}
          isCurrentPlayer={player.playerId === currentPlayerId}
          rank={index + 1}
        />
      ))}
    </div>
  );
}

interface CompactScoreboardProps {
  scores: Array<{
    playerId: string;
    playerName: string;
    score: number;
  }>;
  currentPlayerId?: string;
  className?: string;
}

export function CompactScoreboard({
  scores,
  currentPlayerId,
  className = "",
}: CompactScoreboardProps) {
  const sortedScores = [...scores].sort((a, b) => b.score - a.score);

  return (
    <div className={`flex flex-wrap gap-4 ${className}`}>
      {sortedScores.map((player, index) => (
        <motion.div
          key={player.playerId}
          className={`px-4 py-2 rounded-lg ${
            player.playerId === currentPlayerId
              ? "bg-blue-100 border-2 border-blue-400"
              : "bg-white/80"
          }`}
          layout
        >
          <div className="flex items-center gap-2">
            <span className={`font-bold ${
              index === 0 ? "text-yellow-500" :
              index === 1 ? "text-gray-400" :
              index === 2 ? "text-orange-400" :
              "text-gray-600"
            }`}>
              #{index + 1}
            </span>
            <span className="font-medium">{player.playerName}</span>
            <span className={`font-bold ${
              player.score >= 0 ? "text-green-600" : "text-red-600"
            }`}>
              ${player.score.toLocaleString()}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
