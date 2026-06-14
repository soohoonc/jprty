import { describe, expect, test } from "bun:test";
import { getRoomCodeDisplay, maskRoomCode } from "./room-code-visibility";

describe("room code visibility", () => {
	test("keeps the room code visible by default", () => {
		expect(getRoomCodeDisplay("ABCD", false)).toBe("ABCD");
	});

	test("masks each room code character when hidden", () => {
		expect(maskRoomCode("ABCD")).toBe("****");
		expect(getRoomCodeDisplay("WXYZ", true)).toBe("****");
	});
});
