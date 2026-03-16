"use client";

import { Conversation } from "@/lib/useChat";

interface Props {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (conv: Conversation) => void;
}

const statusColors: Record<Conversation["status"], string> = {
  open: "bg-green-500",
  pending: "bg-yellow-400",
  closed: "bg-gray-400",
};

const statusLabels: Record<Conversation["status"], string> = {
  open: "Open",
  pending: "Pending",
  closed: "Closed",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ConversationList({ conversations, selectedId, onSelect }: Props) {
  const sorted = [...conversations].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (sorted.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-gray-400 gap-2">
        <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
        </svg>
        <p className="text-sm text-center">No conversations yet.<br />Tap <strong>+ New</strong> to start one.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-gray-100">
      {sorted.map((conv) => {
        const lastMsg = conv.messages[conv.messages.length - 1];
        const isSelected = conv.id === selectedId;
        return (
          <button
            key={conv.id}
            onClick={() => onSelect(conv)}
            className={`w-full text-left px-4 py-3 transition hover:bg-gray-50 ${
              isSelected ? "bg-brand-50 border-l-4 border-brand-500" : "border-l-4 border-transparent"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 truncate">{conv.customer.name}</span>
                  <span
                    className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full text-white ${statusColors[conv.status]}`}
                  >
                    {statusLabels[conv.status]}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{conv.customer.phone}</p>
                {lastMsg && (
                  <p className="text-sm text-gray-600 mt-1 truncate">
                    {lastMsg.sender === "agent" ? "You: " : ""}
                    {lastMsg.text}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-xs text-gray-400">{timeAgo(conv.createdAt)}</span>
                <span className="text-xs text-gray-400">{conv.messages.length} msg{conv.messages.length !== 1 ? "s" : ""}</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
