use spacetimedb::{Identity, ReducerContext, Timestamp};

#[spacetimedb::table(name = live_room, public)]
pub struct LiveRoom {
    room_id: String,
    room_code: String,
    status: String,
    phase: String,
    max_players: u16,
    num_players: u16,
    host_identity: Option<Identity>,
}

#[spacetimedb::table(name = live_room_player, public)]
pub struct LiveRoomPlayer {
    player_id: String,
    room_id: String,
    identity: Identity,
    name: String,
    connected: bool,
    score: i32,
    joined_at: Timestamp,
}

// The actual reducers for create/join/leave are still served by the
// Prisma/socket bridge in phase 1. This init reducer keeps the module
// publishable while the server adapter boundary is being introduced.
#[spacetimedb::reducer(init)]
pub fn init(_ctx: &ReducerContext) {}
