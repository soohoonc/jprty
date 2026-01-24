"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface CountdownTimerProps {
  seconds: number;
  onComplete?: () => void;
  size?: "sm" | "md" | "lg";
  showWarning?: boolean;
  warningThreshold?: number;
  className?: string;
}

export function CountdownTimer({
  seconds,
  onComplete,
  size = "md",
  showWarning = true,
  warningThreshold = 3,
  className = "",
}: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState(seconds);
  const [isWarning, setIsWarning] = useState(false);

  useEffect(() => {
    setTimeLeft(seconds);
  }, [seconds]);

  useEffect(() => {
    if (timeLeft <= 0) {
      onComplete?.();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        const newTime = prev - 1;
        if (showWarning && newTime <= warningThreshold && newTime > 0) {
          setIsWarning(true);
        }
        return newTime;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, onComplete, showWarning, warningThreshold]);

  const sizeClasses = {
    sm: "text-2xl w-16 h-16",
    md: "text-4xl w-24 h-24",
    lg: "text-6xl w-32 h-32",
  };

  const progress = (timeLeft / seconds) * 100;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      {/* Background circle */}
      <svg
        className={`absolute transform -rotate-90 ${sizeClasses[size]}`}
        viewBox="0 0 100 100"
      >
        {/* Track */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-gray-200"
        />
        {/* Progress */}
        <motion.circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={isWarning ? "text-red-500" : "text-blue-500"}
          initial={false}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.5, ease: "linear" }}
        />
      </svg>

      {/* Time display */}
      <motion.div
        className={`font-bold ${sizeClasses[size]} flex items-center justify-center ${
          isWarning ? "text-red-500" : "text-gray-800"
        }`}
        animate={isWarning ? { scale: [1, 1.1, 1] } : {}}
        transition={{ duration: 0.5, repeat: isWarning ? Infinity : 0 }}
      >
        {timeLeft}
      </motion.div>
    </div>
  );
}

interface LinearTimerProps {
  seconds: number;
  onComplete?: () => void;
  showWarning?: boolean;
  warningThreshold?: number;
  className?: string;
  label?: string;
}

export function LinearTimer({
  seconds,
  onComplete,
  showWarning = true,
  warningThreshold = 3,
  className = "",
  label,
}: LinearTimerProps) {
  const [timeLeft, setTimeLeft] = useState(seconds);
  const [isWarning, setIsWarning] = useState(false);

  useEffect(() => {
    setTimeLeft(seconds);
    setIsWarning(false);
  }, [seconds]);

  useEffect(() => {
    if (timeLeft <= 0) {
      onComplete?.();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        const newTime = prev - 1;
        if (showWarning && newTime <= warningThreshold && newTime > 0) {
          setIsWarning(true);
        }
        return newTime;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, onComplete, showWarning, warningThreshold]);

  const progress = (timeLeft / seconds) * 100;

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-medium text-gray-600">{label}</span>
          <span className={`text-sm font-bold ${isWarning ? "text-red-500" : "text-gray-800"}`}>
            {timeLeft}s
          </span>
        </div>
      )}
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <motion.div
          className={`h-full ${isWarning ? "bg-red-500" : "bg-blue-500"}`}
          initial={{ width: "100%" }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "linear" }}
        />
      </div>
    </div>
  );
}
