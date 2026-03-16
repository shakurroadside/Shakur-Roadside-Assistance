"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface Message {
  id: string;
  conversationId: string;
  sender: "agent" | "customer";
  senderName: string;
  text: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  customer: { name: string; phone: string };
  status: "open" | "closed" | "pending";
  createdAt: string;
  messages: Message[];
}

type ServerEvent =
  | { type: "INIT"; conversations: Conversation[] }
  | { type: "CONVERSATION_ADDED"; conversation: Conversation }
  | { type: "MESSAGE_ADDED"; message: Message }
  | { type: "STATUS_UPDATED"; conversationId: string; status: Conversation["status"] };

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [connected, setConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
    ws.current = socket;

    socket.onopen = () => setConnected(true);
    socket.onclose = () => {
      setConnected(false);
      // Auto-reconnect after 2 seconds
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    socket.onmessage = (event) => {
      const data: ServerEvent = JSON.parse(event.data);
      switch (data.type) {
        case "INIT":
          setConversations(data.conversations);
          break;
        case "CONVERSATION_ADDED":
          setConversations((prev) => [data.conversation, ...prev]);
          break;
        case "MESSAGE_ADDED":
          setConversations((prev) =>
            prev.map((c) =>
              c.id === data.message.conversationId
                ? { ...c, messages: [...c.messages, data.message] }
                : c
            )
          );
          break;
        case "STATUS_UPDATED":
          setConversations((prev) =>
            prev.map((c) =>
              c.id === data.conversationId ? { ...c, status: data.status } : c
            )
          );
          break;
      }
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  }, []);

  const newConversation = useCallback(
    (customer: { name: string; phone: string }) => {
      send({ type: "NEW_CONVERSATION", customer });
    },
    [send]
  );

  const sendMessage = useCallback(
    (conversationId: string, text: string, senderName = "Agent") => {
      send({
        type: "SEND_MESSAGE",
        conversationId,
        sender: "agent",
        senderName,
        text,
      });
    },
    [send]
  );

  const updateStatus = useCallback(
    (conversationId: string, status: Conversation["status"]) => {
      send({ type: "UPDATE_STATUS", conversationId, status });
    },
    [send]
  );

  return { conversations, connected, newConversation, sendMessage, updateStatus };
}
