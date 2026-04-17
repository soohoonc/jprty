use spacetimedb::{ReducerContext, Table};

#[spacetimedb::table(name = live_room, public)]
pub struct LiveRoom {
    #[primary_key]
    room_id: String,
    #[unique]
    room_code: String,
    status: String,
    phase: String,
    max_players: u16,
    num_players: u16,
    host_connected: bool,
}

#[spacetimedb::table(name = live_room_player, public)]
pub struct LiveRoomPlayer {
    #[primary_key]
    player_id: String,
    room_id: String,
    name: String,
    guest_name: String,
    is_host: bool,
    is_active: bool,
    score: i32,
    joined_at: String,
}

#[spacetimedb::table(name = mirrored_game_state, public)]
pub struct MirroredGameState {
    #[primary_key]
    room_id: String,
    phase: String,
    round_type: String,
    round_number: u16,
    total_rounds: u16,
    selector_player_id: String,
    current_player_id: String,
    current_question_id: String,
    current_question_category: String,
    current_question_value: i32,
    time_remaining: i32,
    current_wager: i32,
}

#[spacetimedb::table(name = mirrored_game_score, public)]
pub struct MirroredGameScore {
    #[primary_key]
    score_id: String,
    room_id: String,
    player_id: String,
    score: i32,
}

#[spacetimedb::table(name = mirrored_game_board_cell, public)]
pub struct MirroredGameBoardCell {
    #[primary_key]
    cell_id: String,
    room_id: String,
    round_number: u16,
    row: u16,
    col: u16,
    category: String,
    question_id: String,
    value: i32,
    is_used: bool,
    is_daily_double: bool,
}

fn validate_room_inputs(room_id: &str, room_code: &str) -> Result<(), String> {
    if room_id.trim().is_empty() {
        return Err("room_id is required".to_string());
    }

    if room_code.trim().is_empty() {
        return Err("room_code is required".to_string());
    }

    Ok(())
}

fn validate_player_inputs(player_id: &str, room_id: &str, name: &str) -> Result<(), String> {
    if player_id.trim().is_empty() {
        return Err("player_id is required".to_string());
    }

    if room_id.trim().is_empty() {
        return Err("room_id is required".to_string());
    }

    if name.trim().is_empty() {
        return Err("name is required".to_string());
    }

    Ok(())
}

fn validate_game_state_inputs(room_id: &str) -> Result<(), String> {
    if room_id.trim().is_empty() {
        return Err("room_id is required".to_string());
    }

    Ok(())
}

#[spacetimedb::reducer]
pub fn sync_live_room(
    ctx: &ReducerContext,
    room_id: String,
    room_code: String,
    status: String,
    phase: String,
    max_players: u16,
    num_players: u16,
    host_connected: bool,
) -> Result<(), String> {
    validate_room_inputs(&room_id, &room_code)?;

    let next_room = LiveRoom {
        room_id: room_id.clone(),
        room_code,
        status,
        phase,
        max_players,
        num_players,
        host_connected,
    };

    if let Some(_existing_room) = ctx.db.live_room().room_id().find(room_id) {
        ctx.db.live_room().room_id().update(next_room);
        return Ok(());
    }

    if let Some(existing_room) = ctx.db.live_room().room_code().find(next_room.room_code.clone()) {
        ctx.db.live_room().room_id().delete(existing_room.room_id);
    }

    ctx.db.live_room().insert(next_room);

    Ok(())
}

#[spacetimedb::reducer]
pub fn sync_live_room_player(
    ctx: &ReducerContext,
    player_id: String,
    room_id: String,
    name: String,
    guest_name: String,
    is_host: bool,
    is_active: bool,
    score: i32,
    joined_at: String,
) -> Result<(), String> {
    validate_player_inputs(&player_id, &room_id, &name)?;

    if ctx.db.live_room().room_id().find(room_id.clone()).is_none() {
        return Err(format!("room {} has not been provisioned", room_id));
    }

    let next_player = LiveRoomPlayer {
        player_id: player_id.clone(),
        room_id,
        name,
        guest_name,
        is_host,
        is_active,
        score,
        joined_at,
    };

    if let Some(_existing_player) = ctx.db.live_room_player().player_id().find(player_id) {
        ctx.db.live_room_player().player_id().update(next_player);
        return Ok(());
    }

    ctx.db.live_room_player().insert(next_player);

    Ok(())
}

#[spacetimedb::reducer]
pub fn remove_live_room_player(ctx: &ReducerContext, player_id: String) -> Result<(), String> {
    if player_id.trim().is_empty() {
        return Err("player_id is required".to_string());
    }

    if let Some(existing_player) = ctx.db.live_room_player().player_id().find(player_id) {
        ctx.db
            .live_room_player()
            .player_id()
            .delete(existing_player.player_id);
    }

    Ok(())
}

#[spacetimedb::reducer]
pub fn sync_mirrored_game_state(
    ctx: &ReducerContext,
    room_id: String,
    phase: String,
    round_type: String,
    round_number: u16,
    total_rounds: u16,
    selector_player_id: String,
    current_player_id: String,
    current_question_id: String,
    current_question_category: String,
    current_question_value: i32,
    time_remaining: i32,
    current_wager: i32,
) -> Result<(), String> {
    validate_game_state_inputs(&room_id)?;

    if ctx.db.live_room().room_id().find(room_id.clone()).is_none() {
        return Err(format!("room {} has not been provisioned", room_id));
    }

    let next_state = MirroredGameState {
        room_id: room_id.clone(),
        phase,
        round_type,
        round_number,
        total_rounds,
        selector_player_id,
        current_player_id,
        current_question_id,
        current_question_category,
        current_question_value,
        time_remaining,
        current_wager,
    };

    if let Some(_existing_state) = ctx.db.mirrored_game_state().room_id().find(room_id) {
        ctx.db
            .mirrored_game_state()
            .room_id()
            .update(next_state);
        return Ok(());
    }

    ctx.db.mirrored_game_state().insert(next_state);

    Ok(())
}

#[spacetimedb::reducer]
pub fn sync_mirrored_game_score(
    ctx: &ReducerContext,
    score_id: String,
    room_id: String,
    player_id: String,
    score: i32,
) -> Result<(), String> {
    validate_player_inputs(&player_id, &room_id, &player_id)?;

    let next_score = MirroredGameScore {
        score_id: score_id.clone(),
        room_id,
        player_id,
        score,
    };

    if let Some(_existing_score) = ctx.db.mirrored_game_score().score_id().find(score_id) {
        ctx.db
            .mirrored_game_score()
            .score_id()
            .update(next_score);
        return Ok(());
    }

    ctx.db.mirrored_game_score().insert(next_score);

    Ok(())
}

#[spacetimedb::reducer]
pub fn remove_mirrored_game_score(ctx: &ReducerContext, score_id: String) -> Result<(), String> {
    if score_id.trim().is_empty() {
        return Err("score_id is required".to_string());
    }

    if let Some(existing_score) = ctx.db.mirrored_game_score().score_id().find(score_id) {
        ctx.db
            .mirrored_game_score()
            .score_id()
            .delete(existing_score.score_id);
    }

    Ok(())
}

#[spacetimedb::reducer]
pub fn sync_mirrored_game_board_cell(
    ctx: &ReducerContext,
    cell_id: String,
    room_id: String,
    round_number: u16,
    row: u16,
    col: u16,
    category: String,
    question_id: String,
    value: i32,
    is_used: bool,
    is_daily_double: bool,
) -> Result<(), String> {
    validate_game_state_inputs(&room_id)?;

    let next_cell = MirroredGameBoardCell {
        cell_id: cell_id.clone(),
        room_id,
        round_number,
        row,
        col,
        category,
        question_id,
        value,
        is_used,
        is_daily_double,
    };

    if let Some(_existing_cell) = ctx.db.mirrored_game_board_cell().cell_id().find(cell_id) {
        ctx.db
            .mirrored_game_board_cell()
            .cell_id()
            .update(next_cell);
        return Ok(());
    }

    ctx.db.mirrored_game_board_cell().insert(next_cell);

    Ok(())
}

#[spacetimedb::reducer(init)]
pub fn init(_ctx: &ReducerContext) {}
