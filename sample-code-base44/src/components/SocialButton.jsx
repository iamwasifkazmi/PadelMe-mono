/**
 * SocialButton — Unified relationship action button.
 *
 * Derives ALL state from the relationship engine (lib/relationships.js).
 * Never computes relationship state inline.
 *
 * Props:
 *  currentUser    — authenticated user object
 *  targetUser     — user being viewed/interacted with
 *  friendRequests — full list from ["friend-requests"] query
 *  blockedList    — BlockedUser[] where blocker_email === currentUser.email
 *  blockedMeList  — BlockedUser[] where blocked_email === currentUser.email (optional)
 *  onMessage      — callback to open conversation
 *  showMessage    — whether to show Message button (default false)
 *  size           — "sm" | "default"
 */

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import {
  UserPlus, UserCheck, UserX, Clock, Ban, MoreHorizontal,
  MessageCircle, Shield
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { notifyFriendRequest, notifyFriendRequestAccepted } from "@/lib/notifications";
import { resolveRelationship } from "@/lib/relationships";
import { getOrCreateDirectConversation } from "@/lib/chat";

export default function SocialButton({
  currentUser,
  targetUser,
  friendRequests = [],
  blockedList = [],
  blockedMeList = [],
  onMessage,
  showMessage = false,
  size = "sm",
}) {
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const refetchAll = async () => {
    await queryClient.invalidateQueries(["friend-requests"]);
    await queryClient.refetchQueries(["friend-requests"]);
    queryClient.invalidateQueries(["blocked-users", currentUser?.email]);
    queryClient.invalidateQueries(["blocked-me", currentUser?.email]);
  };

  // ── Relationship state via unified engine ──────────────────────────────────
  const rel = resolveRelationship(
    currentUser?.email,
    targetUser?.email,
    friendRequests,
    blockedList,
    blockedMeList
  );

  // Helper: find the relevant FriendRequest record
  const sentReq     = friendRequests.find(r => r.requester_email === currentUser?.email && r.recipient_email === targetUser?.email);
  const receivedReq = friendRequests.find(r => r.requester_email === targetUser?.email   && r.recipient_email === currentUser?.email);
  const anyReq      = sentReq || receivedReq;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleAdd = async () => {
    if (loading || rel !== 'not_connected') return;
    setLoading(true);
    await base44.entities.FriendRequest.create({
      requester_email: currentUser.email,
      requester_name:  currentUser.full_name || currentUser.name,
      recipient_email: targetUser.email,
      recipient_name:  targetUser.full_name  || targetUser.name,
      status: "pending",
    });
    notifyFriendRequest(targetUser.email, currentUser).catch(() => {});
    await refetchAll();
    setLoading(false);
  };

  const handleAccept = async () => {
    if (!receivedReq) return;
    setLoading(true);
    await base44.entities.FriendRequest.update(receivedReq.id, { status: "accepted" });
    // Notify the requester (targetUser sent the request)
    notifyFriendRequestAccepted(targetUser.email, currentUser).catch(() => {});
    // Pre-create DM conversation so messaging is immediately available
    getOrCreateDirectConversation(currentUser, targetUser).catch(() => {});
    await refetchAll();
    setLoading(false);
  };

  const handleDecline = async () => {
    if (!receivedReq) return;
    setLoading(true);
    await base44.entities.FriendRequest.update(receivedReq.id, { status: "declined" });
    refetchAll();
    setLoading(false);
  };

  const handleCancel = async () => {
    if (!sentReq) return;
    setLoading(true);
    await base44.entities.FriendRequest.delete(sentReq.id);
    refetchAll();
    setLoading(false);
  };

  const handleRemoveFriend = async () => {
    if (!anyReq) return;
    setLoading(true);
    await base44.entities.FriendRequest.delete(anyReq.id);
    refetchAll();
    setLoading(false);
    setMenuOpen(false);
  };

  const handleBlock = async () => {
    setLoading(true);
    setMenuOpen(false);
    if (anyReq) await base44.entities.FriendRequest.delete(anyReq.id);
    await base44.entities.BlockedUser.create({
      blocker_email: currentUser.email,
      blocked_email: targetUser.email,
    });
    refetchAll();
    setLoading(false);
  };

  const handleUnblock = async () => {
    const entry = blockedList.find(b => b.blocked_email === targetUser?.email);
    if (!entry) return;
    setLoading(true);
    await base44.entities.BlockedUser.delete(entry.id);
    refetchAll();
    setLoading(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (rel === 'blocked') {
    return (
      <Button size={size} variant="outline" disabled={loading} onClick={handleUnblock}
        className="gap-1.5 rounded-lg text-destructive border-destructive/30 hover:bg-destructive/5">
        <Shield className="w-3.5 h-3.5" /> Blocked · Tap to Unblock
      </Button>
    );
  }

  if (rel === 'blocked_by') {
    // They blocked me — show nothing actionable
    return null;
  }

  const renderPrimary = () => {
    switch (rel) {
      case 'friends':
        return (
          <Button size={size} variant="outline" className="gap-1.5 rounded-lg" disabled={loading}>
            <UserCheck className="w-3.5 h-3.5 text-primary" /> Friends
          </Button>
        );
      case 'request_sent':
        return (
          <Button size={size} variant="outline" onClick={handleCancel} disabled={loading}
            className="gap-1.5 rounded-lg text-muted-foreground">
            <Clock className="w-3.5 h-3.5" /> Requested
          </Button>
        );
      case 'request_received':
        return (
          <div className="flex gap-1.5">
            <Button size={size} onClick={handleAccept} disabled={loading} className="gap-1 rounded-lg">
              <UserCheck className="w-3.5 h-3.5" /> Accept
            </Button>
            <Button size={size} variant="outline" onClick={handleDecline} disabled={loading} className="rounded-lg px-2">
              <UserX className="w-3.5 h-3.5" />
            </Button>
          </div>
        );
      default:
        return (
          <Button size={size} onClick={handleAdd} disabled={loading} className="gap-1.5 rounded-lg">
            <UserPlus className="w-3.5 h-3.5" /> Add Friend
          </Button>
        );
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {renderPrimary()}

      {showMessage && onMessage && rel === 'friends' && (
        <Button size={size} variant="ghost" onClick={onMessage}
          className="rounded-lg px-2 text-muted-foreground hover:text-foreground">
          <MessageCircle className="w-3.5 h-3.5" />
        </Button>
      )}

      <div className="relative" ref={menuRef}>
        <button onClick={() => setMenuOpen(o => !o)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-9 w-44 bg-card border border-border rounded-2xl shadow-lg z-50 overflow-hidden py-1">
            {rel === 'friends' && (
              <MenuItem label="Remove Friend" icon={<UserX className="w-3.5 h-3.5" />} onClick={handleRemoveFriend} loading={loading} />
            )}
            <MenuItem label="Block User" icon={<Ban className="w-3.5 h-3.5" />} onClick={handleBlock} loading={loading} danger />
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({ label, icon, onClick, loading, danger }) {
  return (
    <button disabled={loading} onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-secondary transition-colors ${danger ? "text-destructive" : "text-foreground"}`}>
      {icon}{label}
    </button>
  );
}