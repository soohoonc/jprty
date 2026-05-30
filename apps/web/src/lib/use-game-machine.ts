"use client";

import { useCallback, useEffect, useRef } from "react";
import { useMachine } from "@xstate/react";
import { api } from "@/trpc/react";
import { gameMachine, getPhase, type GameBoard } from "./game-machine";

interface Options {
	roomCode: string;
	playerId?: string | null;
	isHost?: boolean;
	enabled?: boolean;
	onGameEnd?: () => void;
	onError?: (message: string) => void;
}

export function useGameMachine({
	roomCode,
	playerId = null,
	isHost = false,
	enabled = true,
	onGameEnd,
	onError,
}: Options) {
	const utils = api.useUtils();
	const initializedRef = useRef(false);
	const [state, send] = useMachine(gameMachine);
	const ctx = state.context;
	const phase = getPhase(state.value as string);

	const { data: room } = api.game.getRoom.useQuery(
		{ roomCode },
		{ enabled: !!roomCode && enabled, refetchInterval: 1500 },
	);

	const startGameMutation = api.game.startGame.useMutation();
	const selectQuestionMutation = api.game.selectQuestion.useMutation();
	const buzzMutation = api.game.buzz.useMutation();
	const submitAnswerMutation = api.game.submitAnswer.useMutation();

	const getPlayerName = (id: string | null): string | null => {
		if (!id) return null;
		const player = room?.players?.find((p) => p.id === id);
		return player?.name || player?.user?.name || null;
	};

	useEffect(() => {
		if (playerId || isHost) {
			send({ type: "SET_IDENTITY", playerId, isHost });
		}
	}, [playerId, isHost, send]);

	const { data: serverState, isLoading } = api.game.getGameState.useQuery(
		{ roomCode },
		{
			enabled: !!roomCode && enabled,
			staleTime: 0,
			refetchInterval: 800,
		},
	);

	useEffect(() => {
		if (!serverState) return;

		if (serverState.board) {
			const values = [...new Set(serverState.board.grid?.map((c) => c.value) ?? [])].sort(
				(a, b) => a - b,
			);
			const questionIds = Object.fromEntries(
				(serverState.board.grid ?? []).map((cell) => [
					`${serverState.board?.categories[cell.col]}_${cell.value}`,
					cell.questionId,
				]),
			);
			const board: GameBoard = {
				categories: serverState.board.categories,
				questionIds,
				answeredQuestions: new Set(
					serverState.board.grid?.filter((c) => c.isUsed).map((c) => c.questionId) ??
						[],
				),
				values: values.length > 0 ? values : [200, 400, 600, 800, 1000],
			};
			send({ type: "UPDATE_BOARD", board });
		}

		if (serverState.scores) {
			send({ type: "UPDATE_SCORES", scores: serverState.scores });
		}
		if (serverState.selectorPlayerId) {
			send({
				type: "UPDATE_SELECTOR",
				selectorPlayerId: serverState.selectorPlayerId,
			});
		}

		const syncData: Record<string, unknown> = {};
		if (serverState.currentQuestion) {
			syncData.currentQuestion = {
				id: serverState.currentQuestion.id,
				clue: serverState.currentQuestion.clue,
				category: serverState.currentQuestion.category || "Unknown",
				value: serverState.currentQuestion.value || 0,
			};
		}
		if (serverState.currentPlayerId) {
			syncData.buzzedPlayerId = serverState.currentPlayerId;
		}
		if (!serverState.currentPlayerId) {
			syncData.buzzedPlayerId = null;
			syncData.buzzedPlayerName = null;
		}

		if (!initializedRef.current && serverState.phase) {
			initializedRef.current = true;
		}

		if (serverState.phase) {
			send({
				type: "SYNC",
				phase: serverState.phase,
				data: Object.keys(syncData).length > 0 ? syncData : undefined,
			});
		}
	}, [serverState, send]);

	useEffect(() => {
		if (phase === "end") {
			onGameEnd?.();
		}
	}, [phase, onGameEnd]);

	useEffect(() => {
		if (!ctx.timeRemaining || ctx.timeRemaining <= 0) return;
		const id = setInterval(() => send({ type: "TICK" }), 1000);
		return () => clearInterval(id);
	}, [ctx.timeRemaining, send]);

	const selectQuestion = useCallback(
		(questionId: string) => {
			if (!playerId) return;
			selectQuestionMutation.mutate(
				{ roomCode, playerId, questionId },
				{
					onError: (error) => onError?.(error.message),
					onSuccess: async () => {
						await utils.game.getGameState.invalidate({ roomCode });
					},
				},
			);
		},
		[playerId, roomCode, selectQuestionMutation, onError, utils.game.getGameState],
	);

	const buzz = useCallback(() => {
		if (!playerId) return;
		if (!state.can({ type: "BUZZ" })) return;
		send({ type: "BUZZ" });
		buzzMutation.mutate(
			{ roomCode, playerId },
			{
				onError: (error) => onError?.(error.message),
				onSuccess: async () => {
					await utils.game.getGameState.invalidate({ roomCode });
				},
			},
		);
	}, [playerId, state, send, buzzMutation, roomCode, utils.game.getGameState, onError]);

	const submitAnswer = useCallback(
		(answer: string) => {
			if (!playerId) return;
			const trimmed = answer.trim();
			if (!trimmed) return;
			submitAnswerMutation.mutate(
				{ roomCode, playerId, answer: trimmed },
				{
					onError: (error) => onError?.(error.message),
					onSuccess: async (result) => {
						send({
							type: "ANSWER_RESULT",
							playerId,
							answer: trimmed,
							isCorrect: result.isCorrect,
							pointChange: result.isCorrect
								? (ctx.currentQuestion?.value ?? 0)
								: -(ctx.currentQuestion?.value ?? 0),
							correctAnswer: result.correctAnswer,
							phase: "REVEALING",
						});
						await utils.game.getGameState.invalidate({ roomCode });
					},
				},
			);
		},
		[
			playerId,
			submitAnswerMutation,
			roomCode,
			onError,
			send,
			ctx.selectorPlayerId,
			utils.game.getGameState,
		],
	);

	const nextQuestion = useCallback(() => {
		void utils.game.getGameState.invalidate({ roomCode });
	}, [utils.game.getGameState, roomCode]);

	const submitWager = useCallback((_wager: number) => {}, []);

	const startGame = useCallback(() => {
		startGameMutation.mutate(
			{ roomCode },
			{
				onError: (error) => onError?.(error.message),
				onSuccess: async () => {
					await utils.game.getGameState.invalidate({ roomCode });
					await utils.game.getRoom.invalidate({ roomCode });
				},
			},
		);
	}, [roomCode, startGameMutation, onError, utils.game.getGameState, utils.game.getRoom]);

	return {
		phase,
		isSelecting: state.matches("selecting"),
		isReading: state.matches("reading"),
		isBuzzing: state.matches("buzzing"),
		isAnswering: state.matches("answering"),
		isRevealing: state.matches("revealing"),
		isDailyDouble: state.matches("dailyDouble"),
		isDailyDoubleAnswer: state.matches("dailyDoubleAnswer"),
		isMyTurn: ctx.buzzedPlayerId !== null && ctx.buzzedPlayerId === ctx.playerId,
		isSelector:
			!ctx.isHost &&
			ctx.selectorPlayerId !== null &&
			ctx.selectorPlayerId === ctx.playerId,
		isDailyDoublePlayer:
			ctx.dailyDoublePlayerId !== null && ctx.dailyDoublePlayerId === ctx.playerId,
		selectorPlayerName: getPlayerName(ctx.selectorPlayerId),
		dailyDoublePlayerName: getPlayerName(ctx.dailyDoublePlayerId),
		canBuzz: state.can({ type: "BUZZ" }),
		board: ctx.board,
		scores: ctx.scores,
		myScore: ctx.scores.find(([id]) => id === ctx.playerId)?.[1] ?? 0,
		currentQuestion: ctx.currentQuestion,
		buzzedPlayerName: getPlayerName(ctx.buzzedPlayerId) || ctx.buzzedPlayerName,
		timeRemaining: ctx.timeRemaining,
		totalTime: ctx.totalTime,
		lastAnswer: ctx.lastAnswer
			? {
					...ctx.lastAnswer,
					playerName:
						getPlayerName(ctx.lastAnswer.playerId ?? null) ||
						ctx.lastAnswer.playerName,
				}
			: null,
		showAnswer: ctx.lastAnswer !== null || ctx.revealedAnswer !== null,
		correctAnswer: ctx.lastAnswer?.correctAnswer || ctx.revealedAnswer || "",
		maxWager: ctx.maxWager,
		currentWager: ctx.currentWager,
		isLoading:
			isLoading ||
			startGameMutation.isPending ||
			selectQuestionMutation.isPending ||
			buzzMutation.isPending ||
			submitAnswerMutation.isPending,
		selectQuestion,
		buzz,
		submitAnswer,
		submitWager,
		nextQuestion,
		startGame,
	};
}

export type { GameBoard, QuestionData, AnswerResult, PlayerScore } from "./game-machine";
