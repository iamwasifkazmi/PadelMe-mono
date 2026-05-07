import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";

type ConversationRealtimePayload = {
  id: string;
  type: string;
  entityId: string | null;
  entityName: string | null;
  participantEmails: string[];
  lastMessageText: string | null;
  lastMessageAt: Date | null;
  lastMessageBy: string | null;
  unreadCounts: unknown;
};

let io: SocketIOServer | null = null;
const emailConnectionCounts = new Map<string, number>();
const socketEmailMap = new Map<string, string>();

function userRoom(email: string) {
  return `user:${email.toLowerCase()}`;
}

function conversationRoom(conversationId: string) {
  return `conversation:${conversationId}`;
}

function matchRoom(matchId: string) {
  return `match:${matchId}`;
}

export function initSocket(server: HttpServer) {
  if (io) return io;
  io = new SocketIOServer(server, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    const rawEmail =
      (typeof socket.handshake.auth?.email === "string" && socket.handshake.auth.email) ||
      (typeof socket.handshake.query?.email === "string" && socket.handshake.query.email) ||
      "";
    const email = rawEmail.trim().toLowerCase();

    if (email) {
      socket.join(userRoom(email));
      socketEmailMap.set(socket.id, email);
      const current = emailConnectionCounts.get(email) || 0;
      emailConnectionCounts.set(email, current + 1);
      if (current === 0) {
        io?.emit("presence:update", { email, isOnline: true });
      }
      socket.emit("presence:snapshot", {
        onlineEmails: Array.from(emailConnectionCounts.keys()),
      });
    }

    socket.on("join:conversation", (conversationId: string) => {
      if (conversationId) socket.join(conversationRoom(conversationId));
    });

    socket.on("leave:conversation", (conversationId: string) => {
      if (conversationId) socket.leave(conversationRoom(conversationId));
    });

    socket.on("join:match", (matchId: string) => {
      if (matchId) socket.join(matchRoom(matchId));
    });

    socket.on("leave:match", (matchId: string) => {
      if (matchId) socket.leave(matchRoom(matchId));
    });

    socket.on(
      "typing:conversation",
      (payload: { conversationId: string; senderEmail: string; senderName: string; isTyping: boolean }) => {
        if (!payload?.conversationId) return;
        socket.to(conversationRoom(payload.conversationId)).emit("typing:conversation", payload);
      },
    );

    socket.on(
      "typing:match",
      (payload: { matchId: string; senderEmail: string; senderName: string; isTyping: boolean }) => {
        if (!payload?.matchId) return;
        socket.to(matchRoom(payload.matchId)).emit("typing:match", payload);
      },
    );

    socket.on("disconnect", () => {
      const disconnectedEmail = socketEmailMap.get(socket.id);
      socketEmailMap.delete(socket.id);
      if (!disconnectedEmail) return;
      const current = emailConnectionCounts.get(disconnectedEmail) || 0;
      if (current <= 1) {
        emailConnectionCounts.delete(disconnectedEmail);
        io?.emit("presence:update", { email: disconnectedEmail, isOnline: false });
        return;
      }
      emailConnectionCounts.set(disconnectedEmail, current - 1);
    });
  });

  return io;
}

export function emitConversationMessage(
  conversationId: string,
  message: {
    id: string;
    conversationId: string;
    senderEmail: string;
    senderName: string;
    text: string;
    createdAt: Date;
  },
  participantEmails: string[],
) {
  if (!io) return;
  io.to(conversationRoom(conversationId)).emit("conversation:message", message);
  for (const email of participantEmails) {
    io.to(userRoom(email)).emit("conversation:message", message);
  }
}

export function emitConversationUpdated(
  conversation: ConversationRealtimePayload,
  participantEmails: string[],
) {
  if (!io) return;
  io.to(conversationRoom(conversation.id)).emit("conversation:updated", conversation);
  for (const email of participantEmails) {
    io.to(userRoom(email)).emit("conversation:updated", conversation);
  }
}

export function emitConversationReceipt(
  conversationId: string,
  participantEmails: string[],
  payload: {
    messageIds: string[];
    status: "delivered" | "read";
    actorEmail: string;
    at: Date;
  },
) {
  if (!io) return;
  const eventPayload = {
    conversationId,
    ...payload,
  };
  io.to(conversationRoom(conversationId)).emit("conversation:receipt", eventPayload);
  for (const email of participantEmails) {
    io.to(userRoom(email)).emit("conversation:receipt", eventPayload);
  }
}

export type MatchChatMessagePayload = {
  id: string;
  matchId: string;
  senderEmail: string;
  senderName: string;
  senderPhotoUrl?: string | null;
  text: string;
  readBy?: string[];
  status?: string;
  deliveredAt?: Date | null;
  readAt?: Date | null;
  createdAt: Date;
  replyToId?: string | null;
  replyToTextSnapshot?: string | null;
  replyToSenderSnapshot?: string | null;
  replyToSenderEmail?: string | null;
};

export function emitMatchMessage(matchId: string, message: MatchChatMessagePayload) {
  if (!io) return;
  io.to(matchRoom(matchId)).emit("match:message", message);
}

export function emitMatchReceipt(
  matchId: string,
  payload: {
    messageIds: string[];
    status: "delivered" | "read";
    actorEmail: string;
    at: Date;
  },
) {
  if (!io) return;
  io.to(matchRoom(matchId)).emit("match:receipt", {
    matchId,
    ...payload,
  });
}
