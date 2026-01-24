"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Minus, Plus } from "lucide-react";
import { api } from "@/trpc/react";
import { z } from "zod";

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  divisor?: number; // For converting ms to seconds display
}

const numberInputSchema = (min: number, max: number, unit: string) =>
  z.number().min(min, `Min ${min}${unit}`).max(max, `Max ${max}${unit}`);

function NumberInput({ value, onChange, min, max, step, unit, divisor = 1 }: NumberInputProps) {
  const displayMin = min / divisor;
  const displayMax = max / divisor;
  const displayStep = step / divisor;
  const displayValue = value / divisor;

  const [localValue, setLocalValue] = useState(displayValue.toString());
  const [error, setError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const lastServerValue = useRef(displayValue);

  // Only sync from server when not focused and value actually changed
  useEffect(() => {
    if (!isFocused && displayValue !== lastServerValue.current) {
      setLocalValue(displayValue.toString());
      lastServerValue.current = displayValue;
    }
  }, [displayValue, isFocused]);

  const schema = numberInputSchema(displayMin, displayMax, unit);

  const validateAndUpdate = (newDisplayValue: number) => {
    const result = schema.safeParse(newDisplayValue);
    if (!result.success) {
      setError(result.error.issues[0]?.message || "Invalid");
      return false;
    }
    setError(null);
    onChange(Math.round(newDisplayValue * divisor));
    return true;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalValue(val);

    // Validate on change but don't block typing
    const parsed = parseFloat(val);
    if (!isNaN(parsed)) {
      const result = schema.safeParse(parsed);
      setError(result.success ? null : result.error.issues[0]?.message || "Invalid");
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseFloat(localValue);
    if (isNaN(parsed)) {
      setLocalValue(displayValue.toString());
      setError(null);
      return;
    }

    // Clamp to valid range on blur
    const clamped = Math.max(displayMin, Math.min(displayMax, parsed));
    validateAndUpdate(clamped);
    setLocalValue(clamped.toString());
    lastServerValue.current = clamped; // Prevent re-sync flash
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  const increment = () => {
    const newVal = Math.min(displayMax, displayValue + displayStep);
    setLocalValue(newVal.toString());
    validateAndUpdate(newVal);
  };

  const decrement = () => {
    const newVal = Math.max(displayMin, displayValue - displayStep);
    setLocalValue(newVal.toString());
    validateAndUpdate(newVal);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={decrement}
          disabled={displayValue <= displayMin}
        >
          <Minus className="h-4 w-4" />
        </Button>

        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={localValue}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={`w-20 h-9 text-center font-medium border rounded-md bg-background
              ${error ? "border-destructive" : "border-input"}
              focus:outline-none focus:ring-2 focus:ring-ring`}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
            {unit}
          </span>
        </div>

        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={increment}
          disabled={displayValue >= displayMax}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

interface RoomSettingsProps {
  roomId: string;
  roomCode: string;
  isHost: boolean;
}

export function RoomSettings({ roomId, roomCode, isHost }: RoomSettingsProps) {
  const utils = api.useUtils();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = useRef<Record<string, number | string>>({});

  // Get room data from React Query
  const { data: room } = api.game.getRoom.useQuery(
    { roomCode },
    { enabled: !!roomCode, staleTime: 2000 } // Reduce refetch frequency
  );

  const config = room?.configuration;

  // Use server state directly - NumberInput handles its own local state for immediate feedback
  const buzzWindowMs = config?.buzzWindowMs ?? 5000;
  const answerWindowMs = config?.answerWindowMs ?? 30000;
  const roundCount = config?.roundCount ?? 1;

  const updateConfig = api.game.updateRoomConfig.useMutation({
    onSuccess: () => {
      // Only invalidate after debounce completes
      pendingUpdatesRef.current = {};
      utils.game.getRoom.invalidate({ roomCode });
    },
  });

  // Debounced update - batches rapid changes
  const debouncedUpdate = useCallback(
    (updates: {
      difficulty?: "EASY" | "MEDIUM" | "HARD";
      buzzWindowMs?: number;
      answerWindowMs?: number;
      roundCount?: number;
    }) => {
      // Accumulate updates
      pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...updates };

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        updateConfig.mutate({ roomId, config: pendingUpdatesRef.current });
      }, 500);
    },
    [roomId, updateConfig]
  );

  if (!isHost) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
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
        <CardTitle className="flex items-center gap-2">
          Settings
          {updateConfig.isPending && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Buzz Window */}
        <div className="space-y-2">
          <Label>Buzz Window</Label>
          <NumberInput
            value={buzzWindowMs}
            onChange={(value) => debouncedUpdate({ buzzWindowMs: value })}
            min={3000}
            max={15000}
            step={1000}
            unit="s"
            divisor={1000}
          />
        </div>

        {/* Answer Time */}
        <div className="space-y-2">
          <Label>Answer Time</Label>
          <NumberInput
            value={answerWindowMs}
            onChange={(value) => debouncedUpdate({ answerWindowMs: value })}
            min={5000}
            max={60000}
            step={5000}
            unit="s"
            divisor={1000}
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
                onClick={() => debouncedUpdate({ roundCount: value })}
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
