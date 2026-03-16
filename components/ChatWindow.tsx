"use client";

import { useEffect, useRef, useState } from "react";
import { Conversation, Message } from "@/lib/useChat";

interface Props {
  conversation: Conversation;
  onSend: (text: string) => void;
  onStatusChange: (status: Conversation["status"]) => void;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const STATUS_OPTIONS: Conversation["status"][] = ["open", "pending", "closed"];

export default function ChatWindow({ conversation, onSend, onStatusChange }: Props) {
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation.messages.length]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-lg select-none">
          {conversation.customer.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{conversation.customer.name}</p>
          <p className="text-xs text-gray-500">{conversation.customer.phone}</p>
        </div>
        {/* Status selector */}
        <select
          value={conversation.status}
          onChange={(e) => onStatusChange(e.target.value as Conversation["status"])}
          className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-3">
        {conversation.messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-sm">No messages yet. Say hello!</p>
          </div>
        ) : (
          conversation.messages.map((msg: Message) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="bg-white border-t border-gray-200 p-3 flex gap-2 items-end">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Type a message… (Enter to send)"
          rows={1}
          className="flex-1 resize-none rounded-2xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 max-h-32 overflow-y-auto"
          style={{ minHeight: "44px" }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="bg-brand-600 text-white rounded-full w-11 h-11 flex items-center justify-center hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0"
          aria-label="Send"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isAgent = message.sender === "agent";
  return (
    <div className={`flex ${isAgent ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[75%] ${isAgent ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
        <span className="text-xs text-gray-400 px-1">
          {isAgent ? "You" : message.senderName}
        </span>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isAgent
              ? "bg-brand-600 text-white rounded-tr-sm"
              : "bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm"
          }`}
        >
          {message.text}
        </div>
        <span className="text-xs text-gray-400 px-1">{formatTime(message.timestamp)}</span>
      </div>
    </div>
  );
}
