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

#[spacetimedb::reducer(init)]
pub fn init(_ctx: &ReducerContext) {}
