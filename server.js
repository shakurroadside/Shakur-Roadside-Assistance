const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer } = require("ws");
const { createApi } = require("./lib/server/api");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

// In-memory store (replace with a DB for production)
const conversations = new Map(); // conversationId -> { id, customer, messages[], status }
const clients = new Set(); // all connected WebSocket clients

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(msg);
    }
  }
}

// Each new booking opens a chat thread so the job shows up in Chat Control too.
function openBookingConversation(job) {
  const tire = job.tire
    ? `${job.tire.qty}× ${job.tire.brand} ${job.tire.model} ${job.tire.size} (${job.tire.season})`
    : "No tires to supply";
  const conv = {
    id: `conv_${Date.now()}`,
    customer: { name: job.customer.name, phone: job.customer.phone },
    status: "open",
    createdAt: new Date().toISOString(),
    messages: [
      {
        id: `msg_${Date.now()}_book`,
        conversationId: `conv_${Date.now()}`,
        sender: "customer",
        senderName: job.customer.name,
        text:
          `📅 New ${job.source === "customer" ? "online booking" : "job"}: ${job.serviceLabel}\n` +
          `${job.date} · ${job.slot}\n` +
          `📍 ${job.location.label || `${job.location.lat.toFixed(4)}, ${job.location.lng.toFixed(4)}`}\n` +
          `🛞 ${tire}\n` +
          `💲 Total quoted: $${job.total}` +
          (job.vehicle ? `\n🚗 ${job.vehicle}` : "") +
          (job.notes ? `\n📝 ${job.notes}` : ""),
        timestamp: new Date().toISOString(),
      },
    ],
  };
  conv.messages[0].conversationId = conv.id;
  conversations.set(conv.id, conv);
  broadcast({ type: "CONVERSATION_ADDED", conversation: conv });
}

const api = createApi({
  onJobsChanged: () => broadcast({ type: "JOBS_CHANGED" }),
  onNewBooking: openBookingConversation,
});

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    if (parsedUrl.pathname && parsedUrl.pathname.startsWith("/api/")) {
      api(req, res, parsedUrl.pathname, parsedUrl.query);
      return;
    }
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    clients.add(ws);

    // Send current state to newly connected client
    ws.send(
      JSON.stringify({
        type: "INIT",
        conversations: Array.from(conversations.values()),
      })
    );

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (msg.type) {
        case "NEW_CONVERSATION": {
          const conv = {
            id: `conv_${Date.now()}`,
            customer: msg.customer,
            status: "open",
            createdAt: new Date().toISOString(),
            messages: [],
          };
          conversations.set(conv.id, conv);
          broadcast({ type: "CONVERSATION_ADDED", conversation: conv });
          break;
        }

        case "SEND_MESSAGE": {
          const conv = conversations.get(msg.conversationId);
          if (!conv) return;
          const message = {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            conversationId: msg.conversationId,
            sender: msg.sender, // "agent" | "customer"
            senderName: msg.senderName,
            text: msg.text,
            timestamp: new Date().toISOString(),
          };
          conv.messages.push(message);
          broadcast({ type: "MESSAGE_ADDED", message });
          break;
        }

        case "UPDATE_STATUS": {
          const conv = conversations.get(msg.conversationId);
          if (!conv) return;
          conv.status = msg.status;
          broadcast({
            type: "STATUS_UPDATED",
            conversationId: msg.conversationId,
            status: msg.status,
          });
          break;
        }
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });
  });

  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
    console.log(`> WebSocket ready on ws://localhost:${port}/ws`);
  });
});
