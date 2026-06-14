export function maskRoomCode(roomCode: string) {
	return "*".repeat(roomCode.length);
}

export function getRoomCodeDisplay(roomCode: string, isHidden: boolean) {
	return isHidden ? maskRoomCode(roomCode) : roomCode;
}
