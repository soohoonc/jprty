// Room events - for room lifecycle and player management
export const ROOM_EVENTS = {
  // Client -> Server
  JOIN: 'room:join',
  LEAVE: 'room:leave',
  START_GAME: 'room:start_game',
  GET_STATE: 'room:get_state',

  // Server -> Client
  JOINED: 'room:joined',
  PLAYER_JOINED: 'room:player_joined',
  PLAYER_LEFT: 'room:player_left',
  GAME_STARTED: 'room:game_started',
  STATE: 'room:state',
  ERROR: 'room:error',
} as const;

// Game events - for gameplay mechanics
export const GAME_EVENTS = {
  // Client -> Server (Host only)
  SELECT_QUESTION: 'game:select_question',

  // Client -> Server (Player only)
  BUZZ: 'game:buzz',
  SUBMIT_ANSWER: 'game:submit_answer',
  SUBMIT_WAGER: 'game:submit_wager',
  SUBMIT_FINAL_WAGER: 'game:submit_final_wager',
  SUBMIT_FINAL_ANSWER: 'game:submit_final_answer',

  // Client -> Server (Any)
  GET_STATE: 'game:get_state',

  // Server -> Client
  STATE_UPDATE: 'game:state_update',
  QUESTION_SELECTED: 'game:question_selected',
  BUZZER_OPEN: 'game:buzzer_open',
  PLAYER_BUZZED: 'game:player_buzzed',
  ANSWER_RESULT: 'game:answer_result',
  DAILY_DOUBLE: 'game:daily_double',
  ROUND_END: 'game:round_end',
  FINAL_JEOPARDY_START: 'game:final_jeopardy_start',
  FINAL_JEOPARDY_REVEAL: 'game:final_jeopardy_reveal',
  GAME_END: 'game:game_end',
  ERROR: 'game:error',
} as const;

// System events - for connection management
export const SYSTEM_EVENTS = {
  PING: 'system:ping',
  PONG: 'system:pong',
  RECONNECT: 'system:reconnect',
  RECONNECTED: 'system:reconnected',
  ERROR: 'system:error',
} as const;

// Type exports
export type RoomEvent = typeof ROOM_EVENTS[keyof typeof ROOM_EVENTS];
export type GameEvent = typeof GAME_EVENTS[keyof typeof GAME_EVENTS];
export type SystemEvent = typeof SYSTEM_EVENTS[keyof typeof SYSTEM_EVENTS];
