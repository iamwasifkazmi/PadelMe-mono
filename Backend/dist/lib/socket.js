import { Server as SocketIOServer } from "socket.io";
let io = null;
const emailConnectionCounts = new Map();
const socketEmailMap = new Map();
function userRoom(email) {
    return `user:${email.toLowerCase()}`;
}
function conversationRoom(conversationId) {
    return `conversation:${conversationId}`;
}
function matchRoom(matchId) {
    return `match:${matchId}`;
}
export function initSocket(server) {
    if (io)
        return io;
    io = new SocketIOServer(server, {
        cors: { origin: "*" },
    });
    io.on("connection", (socket) => {
        const rawEmail = (typeof socket.handshake.auth?.email === "string" && socket.handshake.auth.email) ||
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
        socket.on("join:conversation", (conversationId) => {
            if (conversationId)
                socket.join(conversationRoom(conversationId));
        });
        socket.on("leave:conversation", (conversationId) => {
            if (conversationId)
                socket.leave(conversationRoom(conversationId));
        });
        socket.on("join:match", (matchId) => {
            if (matchId)
                socket.join(matchRoom(matchId));
        });
        socket.on("leave:match", (matchId) => {
            if (matchId)
                socket.leave(matchRoom(matchId));
        });
        socket.on("typing:conversation", (payload) => {
            if (!payload?.conversationId)
                return;
            socket.to(conversationRoom(payload.conversationId)).emit("typing:conversation", payload);
        });
        socket.on("typing:match", (payload) => {
            if (!payload?.matchId)
                return;
            socket.to(matchRoom(payload.matchId)).emit("typing:match", payload);
        });
        socket.on("disconnect", () => {
            const disconnectedEmail = socketEmailMap.get(socket.id);
            socketEmailMap.delete(socket.id);
            if (!disconnectedEmail)
                return;
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
export function emitConversationMessage(conversationId, message, participantEmails) {
    if (!io)
        return;
    io.to(conversationRoom(conversationId)).emit("conversation:message", message);
    for (const email of participantEmails) {
        io.to(userRoom(email)).emit("conversation:message", message);
    }
}
export function emitConversationUpdated(conversation, participantEmails) {
    if (!io)
        return;
    io.to(conversationRoom(conversation.id)).emit("conversation:updated", conversation);
    for (const email of participantEmails) {
        io.to(userRoom(email)).emit("conversation:updated", conversation);
    }
}
export function emitConversationReceipt(conversationId, participantEmails, payload) {
    if (!io)
        return;
    const eventPayload = {
        conversationId,
        ...payload,
    };
    io.to(conversationRoom(conversationId)).emit("conversation:receipt", eventPayload);
    for (const email of participantEmails) {
        io.to(userRoom(email)).emit("conversation:receipt", eventPayload);
    }
}
export function emitMatchMessage(matchId, message) {
    if (!io)
        return;
    io.to(matchRoom(matchId)).emit("match:message", message);
}
export function emitMatchReceipt(matchId, payload) {
    if (!io)
        return;
    io.to(matchRoom(matchId)).emit("match:receipt", {
        matchId,
        ...payload,
    });
}
