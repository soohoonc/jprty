-- CreateEnum
CREATE TYPE "public"."RoomStatus" AS ENUM ('WAITING', 'IN_GAME', 'FINISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."RoundType" AS ENUM ('SINGLE_JEOPARDY', 'DOUBLE_JEOPARDY', 'FINAL_JEOPARDY');

-- CreateEnum
CREATE TYPE "public"."GameStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."LeaderboardPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'ALL_TIME');

-- CreateTable
CREATE TABLE "public"."room" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "host_id" TEXT,
    "name" TEXT,
    "status" "public"."RoomStatus" NOT NULL DEFAULT 'WAITING',
    "num_players" INTEGER NOT NULL DEFAULT 0,
    "max_players" INTEGER NOT NULL DEFAULT 8,
    "private" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."player" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."question" (
    "id" TEXT NOT NULL,
    "clue" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "difficulty_score" SMALLINT,
    "air_date" TIMESTAMP(3),
    "show_number" INTEGER,
    "round_type" TEXT,
    "value" INTEGER,
    "clue_hash" TEXT,
    "source" TEXT,
    "external_id" TEXT,
    "question_set_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."question_tag" (
    "question_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "question_tag_pkey" PRIMARY KEY ("question_id","tag_id")
);

-- CreateTable
CREATE TABLE "public"."question_set" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "air_date" TIMESTAMP(3),
    "description" TEXT,
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_set_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."question_set_category" (
    "question_set_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "question_set_category_pkey" PRIMARY KEY ("question_set_id","category_id")
);

-- CreateTable
CREATE TABLE "public"."category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."game_session" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "status" "public"."GameStatus" NOT NULL DEFAULT 'PENDING',
    "winner_id" TEXT,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."round" (
    "id" TEXT NOT NULL,
    "game_session_id" TEXT NOT NULL,
    "round_type" "public"."RoundType" NOT NULL,
    "round_number" INTEGER NOT NULL,
    "question_set_id" TEXT,
    "events" JSONB[] DEFAULT ARRAY[]::JSONB[],

    CONSTRAINT "round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL,
    "image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."session" (
    "id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."account" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."game_configuration" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
    "buzz_window_ms" INTEGER NOT NULL DEFAULT 5000,
    "answer_window_ms" INTEGER NOT NULL DEFAULT 30000,
    "reveal_window_ms" INTEGER NOT NULL DEFAULT 3000,
    "round_count" INTEGER NOT NULL DEFAULT 1,
    "questions_per_category" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_configuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."player_statistics" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "games_played" INTEGER NOT NULL DEFAULT 0,
    "games_won" INTEGER NOT NULL DEFAULT 0,
    "total_score" INTEGER NOT NULL DEFAULT 0,
    "correct_answers" INTEGER NOT NULL DEFAULT 0,
    "incorrect_answers" INTEGER NOT NULL DEFAULT 0,
    "fastest_buzz_ms" INTEGER,
    "average_buzz_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_statistics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."leaderboard" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "period" "public"."LeaderboardPeriod" NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "games_won" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaderboard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "room_code_key" ON "public"."room"("code");

-- CreateIndex
CREATE UNIQUE INDEX "player_room_id_user_id_name_key" ON "public"."player"("room_id", "user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "question_clue_hash_key" ON "public"."question"("clue_hash");

-- CreateIndex
CREATE INDEX "question_air_date_idx" ON "public"."question"("air_date");

-- CreateIndex
CREATE INDEX "question_difficulty_score_idx" ON "public"."question"("difficulty_score");

-- CreateIndex
CREATE UNIQUE INDEX "question_source_external_id_key" ON "public"."question"("source", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "tag_name_key" ON "public"."tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "category_name_key" ON "public"."category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "round_game_session_id_round_number_key" ON "public"."round"("game_session_id", "round_number");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "public"."user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "public"."session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "game_configuration_room_id_key" ON "public"."game_configuration"("room_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_statistics_user_id_key" ON "public"."player_statistics"("user_id");

-- CreateIndex
CREATE INDEX "leaderboard_period_score_idx" ON "public"."leaderboard"("period", "score");

-- CreateIndex
CREATE UNIQUE INDEX "leaderboard_user_id_period_key" ON "public"."leaderboard"("user_id", "period");

-- AddForeignKey
ALTER TABLE "public"."room" ADD CONSTRAINT "room_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "public"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."player" ADD CONSTRAINT "player_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."player" ADD CONSTRAINT "player_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."question" ADD CONSTRAINT "question_question_set_id_fkey" FOREIGN KEY ("question_set_id") REFERENCES "public"."question_set"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."question_tag" ADD CONSTRAINT "question_tag_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."question_tag" ADD CONSTRAINT "question_tag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."question_set_category" ADD CONSTRAINT "question_set_category_question_set_id_fkey" FOREIGN KEY ("question_set_id") REFERENCES "public"."question_set"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."question_set_category" ADD CONSTRAINT "question_set_category_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."game_session" ADD CONSTRAINT "game_session_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."game_session" ADD CONSTRAINT "game_session_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "public"."player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."round" ADD CONSTRAINT "round_game_session_id_fkey" FOREIGN KEY ("game_session_id") REFERENCES "public"."game_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."round" ADD CONSTRAINT "round_question_set_id_fkey" FOREIGN KEY ("question_set_id") REFERENCES "public"."question_set"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."account" ADD CONSTRAINT "account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."game_configuration" ADD CONSTRAINT "game_configuration_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."player_statistics" ADD CONSTRAINT "player_statistics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."leaderboard" ADD CONSTRAINT "leaderboard_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
