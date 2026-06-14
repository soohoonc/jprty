"use client";

import { Button } from "@/components/ui/button";
import { getRoomCodeDisplay } from "@/lib/room-code-visibility";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

type HostRoomCodeProps = {
	roomCode: string;
	className?: string;
	codeClassName?: string;
};

export function HostRoomCode({
	roomCode,
	className,
	codeClassName,
}: HostRoomCodeProps) {
	const [isHidden, setIsHidden] = useState(false);
	const displayCode = getRoomCodeDisplay(roomCode, isHidden);
	const toggleLabel = isHidden ? "Reveal room code" : "Hide room code";
	const ToggleIcon = isHidden ? Eye : EyeOff;

	return (
		<div className={cn("flex items-center justify-center gap-3", className)}>
			<span
				aria-label={isHidden ? "Room code hidden" : "Room code"}
				className={cn(
					"font-bold font-mono text-white tracking-widest",
					codeClassName,
				)}
			>
				{displayCode}
			</span>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label={toggleLabel}
				aria-pressed={isHidden}
				onClick={() => setIsHidden((current) => !current)}
				className="text-white/70 hover:bg-white/10 hover:text-white"
			>
				<ToggleIcon className="h-5 w-5" />
				<span className="sr-only">{toggleLabel}</span>
			</Button>
		</div>
	);
}
