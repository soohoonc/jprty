"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { DollarSign } from "lucide-react";
import { LinearTimer } from "./countdown-timer";

interface WagerInputProps {
  currentScore: number;
  maxWager: number;
  minWager?: number;
  timeLimit?: number;
  onSubmit: (wager: number) => void;
  title?: string;
  description?: string;
}

export function WagerInput({
  currentScore,
  maxWager,
  minWager = 5,
  timeLimit,
  onSubmit,
  title = "Daily Double!",
  description = "How much do you want to wager?",
}: WagerInputProps) {
  const [wager, setWager] = useState(minWager);

  const presetAmounts = [
    { label: "Min", value: minWager },
    { label: "500", value: 500 },
    { label: "1000", value: 1000 },
    { label: "Half", value: Math.floor(maxWager / 2) },
    { label: "Max", value: maxWager },
  ].filter((p) => p.value <= maxWager && p.value >= minWager);

  const handleSubmit = () => {
    const validWager = Math.max(minWager, Math.min(wager, maxWager));
    onSubmit(validWager);
  };

  const handlePreset = (amount: number) => {
    setWager(Math.max(minWager, Math.min(amount, maxWager)));
  };

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="w-full max-w-md mx-auto"
    >
      <Card className="bg-gradient-to-br from-yellow-400 to-yellow-600 text-black">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-3xl font-bold">{title}</CardTitle>
          <p className="text-lg">{description}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current score display */}
          <div className="bg-black/10 rounded-lg p-3 text-center">
            <div className="text-sm font-medium">Your Current Score</div>
            <div className="text-2xl font-bold">${currentScore.toLocaleString()}</div>
          </div>

          {/* Wager input */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <DollarSign className="h-6 w-6" />
              <Input
                type="number"
                value={wager}
                onChange={(e) => setWager(Number(e.target.value))}
                min={minWager}
                max={maxWager}
                className="text-2xl font-bold text-center bg-white"
              />
            </div>
            <div className="text-sm text-center">
              Wager between ${minWager.toLocaleString()} and ${maxWager.toLocaleString()}
            </div>
          </div>

          {/* Preset amounts */}
          <div className="grid grid-cols-5 gap-2">
            {presetAmounts.map((preset) => (
              <Button
                key={preset.label}
                variant={wager === preset.value ? "default" : "secondary"}
                size="sm"
                onClick={() => handlePreset(preset.value)}
                className="font-bold"
              >
                {preset.label}
              </Button>
            ))}
          </div>

          {/* Timer */}
          {timeLimit && (
            <LinearTimer
              seconds={timeLimit}
              onComplete={handleSubmit}
              label="Time to wager"
              warningThreshold={5}
            />
          )}

          {/* Submit button */}
          <Button
            onClick={handleSubmit}
            className="w-full text-xl py-6 bg-blue-600 hover:bg-blue-500 text-white"
            size="lg"
          >
            Lock In Wager: ${wager.toLocaleString()}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface FinalJeopardyWagerProps {
  currentScore: number;
  category: string;
  timeLimit?: number;
  onSubmit: (wager: number) => void;
}

export function FinalJeopardyWager({
  currentScore,
  category,
  timeLimit = 30,
  onSubmit,
}: FinalJeopardyWagerProps) {
  return (
    <div className="space-y-6">
      {/* Category reveal */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h2 className="text-2xl font-bold text-white mb-2">Final Jeopardy Category</h2>
        <div className="text-4xl font-bold text-yellow-400 uppercase">
          {category}
        </div>
      </motion.div>

      {/* Wager input */}
      <WagerInput
        currentScore={currentScore}
        maxWager={Math.max(0, currentScore)}
        minWager={0}
        timeLimit={timeLimit}
        onSubmit={onSubmit}
        title="Final Jeopardy"
        description="How much will you wager on this category?"
      />
    </div>
  );
}
