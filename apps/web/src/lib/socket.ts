"use client";

import { Socket } from "socket.io-client";
import { createContext, useContext } from "react";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL;

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within SocketProvider");
  }
  return context;
}

export { SocketContext, SOCKET_URL };
