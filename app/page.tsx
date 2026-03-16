"use client";

import { useState } from "react";
import { useChat, Conversation } from "@/lib/useChat";
import ConversationList from "@/components/ConversationList";
import ChatWindow from "@/components/ChatWindow";
import NewConversationModal from "@/components/NewConversationModal";

export default function Home() {
  const { conversations, connected, newConversation, sendMessage, updateStatus } = useChat();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showList, setShowList] = useState(true); // mobile nav state

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const handleSelect = (conv: Conversation) => {
    setSelectedId(conv.id);
    setShowList(false); // on mobile, switch to chat view
  };

  const handleBack = () => setShowList(true);

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <header className="bg-brand-600 text-white px-4 py-3 flex items-center gap-3 shadow-md z-10">
        {/* Back button on mobile when in chat view */}
        {!showList && (
          <button
            onClick={handleBack}
            className="md:hidden p-1 rounded hover:bg-brand-700 transition"
            aria-label="Back to conversations"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div className="flex-1 flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight">🚗 Shakur Roadside</span>
          <span className="hidden sm:inline text-brand-100 text-sm">Chat Control</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`}
            title={connected ? "Connected" : "Reconnecting…"}
          />
          <span className="text-xs text-brand-100">{connected ? "Live" : "Reconnecting…"}</span>
          <button
            onClick={() => setShowNew(true)}
            className="ml-2 bg-white text-brand-600 font-semibold text-sm px-3 py-1.5 rounded-full hover:bg-brand-50 transition"
          >
            + New
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar – always visible on md+, toggled on mobile */}
        <aside
          className={`
            ${showList ? "flex" : "hidden"} md:flex
            flex-col w-full md:w-80 lg:w-96
            border-r border-gray-200 bg-white
          `}
        >
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        </aside>

        {/* Chat panel */}
        <main
          className={`
            ${!showList ? "flex" : "hidden"} md:flex
            flex-1 flex-col bg-gray-50
          `}
        >
          {selected ? (
            <ChatWindow
              conversation={selected}
              onSend={(text) => sendMessage(selected.id, text)}
              onStatusChange={(status) => updateStatus(selected.id, status)}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
              <svg className="w-16 h-16 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-sm">Select a conversation to start chatting</p>
            </div>
          )}
        </main>
      </div>

      {showNew && (
        <NewConversationModal
          onClose={() => setShowNew(false)}
          onCreate={(customer) => {
            newConversation(customer);
            setShowNew(false);
          }}
        />
      )}
    </div>
  );
}
