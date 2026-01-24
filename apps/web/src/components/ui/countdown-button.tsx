"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "./button";

interface CountdownButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  /** For internal countdown: total seconds to count down from */
  seconds?: number;
  /** For external timer: current time remaining */
  timeRemaining?: number;
  /** For external timer: total time */
  totalTime?: number;
  /** Auto-trigger onClick when countdown reaches 0 (only for internal timer) */
  autoTrigger?: boolean;
  /** Color for the progress bar background */
  progressColor?: string;
  className?: string;
}

export function CountdownButton({
  onClick,
  children,
  seconds,
  timeRemaining: externalRemaining,
  totalTime: externalTotal,
  autoTrigger = true,
  progressColor = "bg-blue-400",
  className = "",
}: CountdownButtonProps) {
  const isExternalTimer = externalRemaining !== undefined && externalTotal !== undefined;

  const [internalRemaining, setInternalRemaining] = useState(seconds ?? 0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasTriggeredRef = useRef(false);
  const onClickRef = useRef(onClick);

  // Keep onClick ref up to date
  onClickRef.current = onClick;

  // Internal countdown timer
  useEffect(() => {
    if (isExternalTimer || !seconds) return;

    hasTriggeredRef.current = false;
    setInternalRemaining(seconds);

    intervalRef.current = setInterval(() => {
      setInternalRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          if (autoTrigger && !hasTriggeredRef.current) {
            hasTriggeredRef.current = true;
            setTimeout(() => onClickRef.current(), 0);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [seconds, isExternalTimer, autoTrigger]);

  const remaining = isExternalTimer ? externalRemaining : internalRemaining;
  const total = isExternalTimer ? externalTotal : (seconds ?? 1);
  // Use (total - 1) as divisor so bar reaches 100% when remaining = 1, not 0
  // This ensures the bar completes before the component might unmount
  const divisor = Math.max(total - 1, 1);
  const progress = Math.min(((total - remaining) / divisor) * 100, 100);

  return (
    <Button
      onClick={onClick}
      className={`relative overflow-hidden ${className}`}
    >
      <div
        className={`absolute inset-0 ${progressColor} transition-all duration-1000 ease-linear`}
        style={{ width: `${progress}%` }}
      />
      <span className="relative">
        {children}
        {remaining > 0 && <span className="ml-2 text-sm opacity-70">({remaining}s)</span>}
      </span>
    </Button>
  );
}
