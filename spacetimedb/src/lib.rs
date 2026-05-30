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
    current_question_clue: String,
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

#[spacetimedb::table(name = live_game_state, public)]
pub struct LiveGameState {
    #[primary_key]
    room_id: String,
    phase: String,
    round_number: u16,
    total_rounds: u16,
    selector_player_id: String,
    current_player_id: String,
    current_question_id: String,
    current_question_category: String,
    current_question_value: i32,
    active_cell_id: String,
}

#[spacetimedb::table(name = live_game_score, public)]
pub struct LiveGameScore {
    #[primary_key]
    score_id: String,
    room_id: String,
    player_id: String,
    score: i32,
}

#[spacetimedb::table(name = live_game_board_cell, public)]
pub struct LiveGameBoardCell {
    #[primary_key]
    cell_id: String,
    room_id: String,
    row: u16,
    col: u16,
    category: String,
    question_id: String,
    clue: String,
    answer: String,
    value: i32,
    is_used: bool,
    is_daily_double: bool,
}

#[spacetimedb::table(name = live_game_buzz, public)]
pub struct LiveGameBuzz {
    #[primary_key]
    buzz_id: String,
    room_id: String,
    player_id: String,
    position: u16,
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
    current_question_clue: String,
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
        current_question_clue,
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

fn clear_live_game_buzz(ctx: &ReducerContext, room_id: &str) {
    let buzz_to_remove: Vec<String> = ctx
        .db
        .live_game_buzz()
        .iter()
        .filter(|buzz| buzz.room_id == room_id)
        .map(|buzz| buzz.buzz_id.clone())
        .collect();

    for buzz_id in buzz_to_remove {
        if let Some(row) = ctx.db.live_game_buzz().buzz_id().find(buzz_id) {
            ctx.db.live_game_buzz().buzz_id().delete(row.buzz_id);
        }
    }
}

#[spacetimedb::reducer]
pub fn start_live_game(
    ctx: &ReducerContext,
    room_id: String,
    selector_player_id: String,
    round_number: u16,
    total_rounds: u16,
) -> Result<(), String> {
    validate_game_state_inputs(&room_id)?;

    if selector_player_id.trim().is_empty() {
        return Err("selector_player_id is required".to_string());
    }

    if ctx.db.live_room().room_id().find(room_id.clone()).is_none() {
        return Err(format!("room {} has not been provisioned", room_id));
    }

    clear_live_game_buzz(ctx, &room_id);

    let next_state = LiveGameState {
        room_id: room_id.clone(),
        phase: "SELECTING".to_string(),
        round_number,
        total_rounds,
        selector_player_id,
        current_player_id: "".to_string(),
        current_question_id: "".to_string(),
        current_question_category: "".to_string(),
        current_question_value: 0,
        active_cell_id: "".to_string(),
    };

    if let Some(_existing_state) = ctx.db.live_game_state().room_id().find(room_id) {
        ctx.db.live_game_state().room_id().update(next_state);
        return Ok(());
    }

    ctx.db.live_game_state().insert(next_state);
    Ok(())
}

#[spacetimedb::reducer]
pub fn sync_live_game_score(
    ctx: &ReducerContext,
    score_id: String,
    room_id: String,
    player_id: String,
    score: i32,
) -> Result<(), String> {
    validate_player_inputs(&player_id, &room_id, &player_id)?;

    let next_score = LiveGameScore {
        score_id: score_id.clone(),
        room_id,
        player_id,
        score,
    };

    if let Some(_existing_score) = ctx.db.live_game_score().score_id().find(score_id) {
        ctx.db.live_game_score().score_id().update(next_score);
        return Ok(());
    }

    ctx.db.live_game_score().insert(next_score);
    Ok(())
}

#[spacetimedb::reducer]
pub fn sync_live_game_board_cell(
    ctx: &ReducerContext,
    cell_id: String,
    room_id: String,
    row: u16,
    col: u16,
    category: String,
    question_id: String,
    clue: String,
    answer: String,
    value: i32,
    is_used: bool,
    is_daily_double: bool,
) -> Result<(), String> {
    validate_game_state_inputs(&room_id)?;

    let next_cell = LiveGameBoardCell {
        cell_id: cell_id.clone(),
        room_id,
        row,
        col,
        category,
        question_id,
        clue,
        answer,
        value,
        is_used,
        is_daily_double,
    };

    if let Some(_existing_cell) = ctx.db.live_game_board_cell().cell_id().find(cell_id) {
        ctx.db.live_game_board_cell().cell_id().update(next_cell);
        return Ok(());
    }

    ctx.db.live_game_board_cell().insert(next_cell);
    Ok(())
}

#[spacetimedb::reducer]
pub fn select_live_game_cell(
    ctx: &ReducerContext,
    room_id: String,
    selector_player_id: String,
    cell_id: String,
) -> Result<(), String> {
    validate_game_state_inputs(&room_id)?;

    let state = ctx
        .db
        .live_game_state()
        .room_id()
        .find(room_id.clone())
        .ok_or_else(|| format!("game state for room {} does not exist", room_id))?;

    if state.phase != "SELECTING" {
        return Err("room is not in SELECTING phase".to_string());
    }

    if state.selector_player_id != selector_player_id {
        return Err("only selector_player_id can choose a clue".to_string());
    }

    let cell = ctx
        .db
        .live_game_board_cell()
        .cell_id()
        .find(cell_id.clone())
        .ok_or_else(|| format!("cell {} not found", cell_id))?;

    if cell.room_id != room_id {
        return Err("selected cell does not belong to room".to_string());
    }

    if cell.is_used {
        return Err("selected cell is already used".to_string());
    }

    clear_live_game_buzz(ctx, &room_id);

    let next_state = LiveGameState {
        room_id: room_id.clone(),
        phase: "BUZZING".to_string(),
        round_number: state.round_number,
        total_rounds: state.total_rounds,
        selector_player_id: state.selector_player_id,
        current_player_id: "".to_string(),
        current_question_id: cell.question_id.clone(),
        current_question_category: cell.category.clone(),
        current_question_value: cell.value,
        active_cell_id: cell_id,
    };

    ctx.db.live_game_state().room_id().update(next_state);
    Ok(())
}

#[spacetimedb::reducer]
pub fn buzz_live_game(
    ctx: &ReducerContext,
    room_id: String,
    player_id: String,
) -> Result<(), String> {
    validate_player_inputs(&player_id, &room_id, &player_id)?;

    let state = ctx
        .db
        .live_game_state()
        .room_id()
        .find(room_id.clone())
        .ok_or_else(|| format!("game state for room {} does not exist", room_id))?;

    if state.phase != "BUZZING" {
        return Err("room is not in BUZZING phase".to_string());
    }

    if !state.current_player_id.is_empty() {
        return Err("a player already controls the buzzer".to_string());
    }

    let next_state = LiveGameState {
        room_id: room_id.clone(),
        phase: "ANSWERING".to_string(),
        round_number: state.round_number,
        total_rounds: state.total_rounds,
        selector_player_id: state.selector_player_id,
        current_player_id: player_id.clone(),
        current_question_id: state.current_question_id,
        current_question_category: state.current_question_category,
        current_question_value: state.current_question_value,
        active_cell_id: state.active_cell_id,
    };
    ctx.db.live_game_state().room_id().update(next_state);

    let buzz = LiveGameBuzz {
        buzz_id: format!("{}:{}", room_id, player_id.clone()),
        room_id,
        player_id,
        position: 1,
    };

    if let Some(_existing_buzz) = ctx.db.live_game_buzz().buzz_id().find(buzz.buzz_id.clone()) {
        ctx.db.live_game_buzz().buzz_id().update(buzz);
        return Ok(());
    }

    ctx.db.live_game_buzz().insert(buzz);
    Ok(())
}

#[spacetimedb::reducer]
pub fn submit_live_game_answer(
    ctx: &ReducerContext,
    room_id: String,
    player_id: String,
    is_correct: bool,
) -> Result<(), String> {
    validate_player_inputs(&player_id, &room_id, &player_id)?;

    let state = ctx
        .db
        .live_game_state()
        .room_id()
        .find(room_id.clone())
        .ok_or_else(|| format!("game state for room {} does not exist", room_id))?;

    if state.phase != "ANSWERING" {
        return Err("room is not in ANSWERING phase".to_string());
    }

    if state.current_player_id != player_id {
        return Err("only current_player_id can submit answer".to_string());
    }

    let score_id = format!("{}:{}", room_id, player_id.clone());
    let score_row = ctx.db.live_game_score().score_id().find(score_id.clone());
    let previous_score = score_row.as_ref().map(|row| row.score).unwrap_or(0);
    let delta = if is_correct {
        state.current_question_value
    } else {
        -state.current_question_value
    };

    let next_score = LiveGameScore {
        score_id: score_id.clone(),
        room_id: room_id.clone(),
        player_id: player_id.clone(),
        score: previous_score + delta,
    };

    if score_row.is_some() {
        ctx.db.live_game_score().score_id().update(next_score);
    } else {
        ctx.db.live_game_score().insert(next_score);
    }

    let cell = ctx
        .db
        .live_game_board_cell()
        .cell_id()
        .find(state.active_cell_id.clone())
        .ok_or_else(|| format!("active cell {} not found", state.active_cell_id))?;

    let used_cell = LiveGameBoardCell {
        cell_id: cell.cell_id,
        room_id: cell.room_id,
        row: cell.row,
        col: cell.col,
        category: cell.category,
        question_id: cell.question_id,
        clue: cell.clue,
        answer: cell.answer,
        value: cell.value,
        is_used: true,
        is_daily_double: cell.is_daily_double,
    };
    ctx.db.live_game_board_cell().cell_id().update(used_cell);

    clear_live_game_buzz(ctx, &room_id);

    let next_selector = if is_correct {
        player_id
    } else {
        state.selector_player_id.clone()
    };

    let next_state = LiveGameState {
        room_id: room_id.clone(),
        phase: "SELECTING".to_string(),
        round_number: state.round_number,
        total_rounds: state.total_rounds,
        selector_player_id: next_selector,
        current_player_id: "".to_string(),
        current_question_id: "".to_string(),
        current_question_category: "".to_string(),
        current_question_value: 0,
        active_cell_id: "".to_string(),
    };
    ctx.db.live_game_state().room_id().update(next_state);

    Ok(())
}
