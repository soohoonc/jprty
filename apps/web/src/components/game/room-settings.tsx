"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { api } from "@/trpc/react";

interface RoomSettingsProps {
  roomId: string;
  isHost: boolean;
  initialConfig?: {
    difficulty?: string;
    buzzWindowMs?: number;
    answerWindowMs?: number;
    revealWindowMs?: number;
    roundCount?: number;
    questionsPerCategory?: number;
  };
}

const DIFFICULTY_OPTIONS = [
  { value: "EASY", label: "Easy" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HARD", label: "Hard" },
];

export function RoomSettings({
  roomId,
  isHost,
  initialConfig,
}: RoomSettingsProps) {
  const [difficulty, setDifficulty] = useState(initialConfig?.difficulty || "MEDIUM");
  const [buzzWindowMs, setBuzzWindowMs] = useState(initialConfig?.buzzWindowMs || 5000);
  const [answerWindowMs, setAnswerWindowMs] = useState(initialConfig?.answerWindowMs || 15000);
  const [roundCount, setRoundCount] = useState(initialConfig?.roundCount || 1);
  const isFirstRender = useRef(true);

  const updateConfig = api.game.updateRoomConfig.useMutation();

  // Auto-save when settings change (skip first render)
  useEffect(() => {
    if (!isHost) return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timeout = setTimeout(() => {
      updateConfig.mutate({
        roomId,
        config: {
          difficulty: difficulty as "EASY" | "MEDIUM" | "HARD",
          buzzWindowMs,
          answerWindowMs,
          roundCount,
        },
      });
    }, 500);

    return () => clearTimeout(timeout);
  }, [difficulty, buzzWindowMs, answerWindowMs, roundCount, roomId, isHost]);

  if (!isHost) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Difficulty</span>
            <span>{difficulty}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Buzz Window</span>
            <span>{buzzWindowMs / 1000}s</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Answer Time</span>
            <span>{answerWindowMs / 1000}s</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Rounds</span>
            <span>{roundCount}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Difficulty */}
        <div className="space-y-2">
          <Label>Difficulty</Label>
          <div className="flex gap-2">
            {DIFFICULTY_OPTIONS.map((option) => (
              <Button
                key={option.value}
                variant={difficulty === option.value ? "default" : "outline"}
                size="sm"
                onClick={() => setDifficulty(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Buzz Window */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label>Buzz Window</Label>
            <span className="text-sm">{buzzWindowMs / 1000}s</span>
          </div>
          <Slider
            value={[buzzWindowMs]}
            onValueChange={([value]) => setBuzzWindowMs(value!)}
            min={3000}
            max={15000}
            step={1000}
          />
        </div>

        {/* Answer Time */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label>Answer Time</Label>
            <span className="text-sm">{answerWindowMs / 1000}s</span>
          </div>
          <Slider
            value={[answerWindowMs]}
            onValueChange={([value]) => setAnswerWindowMs(value!)}
            min={5000}
            max={30000}
            step={5000}
          />
        </div>

        {/* Round Count */}
        <div className="space-y-2">
          <Label>Rounds</Label>
          <div className="flex gap-2">
            {[1, 2, 3].map((value) => (
              <Button
                key={value}
                variant={roundCount === value ? "default" : "outline"}
                size="sm"
                onClick={() => setRoundCount(value)}
              >
                {value === 1 ? "Single" : value === 2 ? "Double" : "Full"}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
