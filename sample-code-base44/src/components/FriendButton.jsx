import { useState } from "react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { UserPlus, UserCheck, UserX, Clock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function FriendButton({ currentUser, targetUser, friendRequests = [] }) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries(["friend-requests"]);
    queryClient.invalidateQueries(["friend-requests-received"]);
  };

  // Determine relationship status
  const sent = friendRequests.find(
    (r) => r.requester_email === currentUser?.email && r.recipient_email === targetUser?.email
  );
  const received = friendRequests.find(
    (r) => r.requester_email === targetUser?.email && r.recipient_email === currentUser?.email
  );

  const isFriend = (sent && sent.status === "accepted") || (received && received.status === "accepted");
  const isPending = sent && sent.status === "pending";
  const isReceived = received && received.status === "pending";

  const handleAdd = async () => {
    setLoading(true);
    await base44.entities.FriendRequest.create({
      requester_email: currentUser.email,
      requester_name: currentUser.full_name,
      recipient_email: targetUser.email,
      recipient_name: targetUser.full_name,
      status: "pending",
    });
    invalidate();
    setLoading(false);
  };

  const handleAccept = async () => {
    setLoading(true);
    await base44.entities.FriendRequest.update(received.id, { status: "accepted" });
    invalidate();
    setLoading(false);
  };

  const handleDecline = async () => {
    setLoading(true);
    await base44.entities.FriendRequest.update(received.id, { status: "declined" });
    invalidate();
    setLoading(false);
  };

  const handleCancel = async () => {
    setLoading(true);
    await base44.entities.FriendRequest.delete(sent.id);
    invalidate();
    setLoading(false);
  };

  const handleRemove = async () => {
    setLoading(true);
    const toDelete = sent || received;
    if (toDelete) await base44.entities.FriendRequest.delete(toDelete.id);
    invalidate();
    setLoading(false);
  };

  if (isFriend) {
    return (
      <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={handleRemove} disabled={loading}>
        <UserCheck className="w-4 h-4 text-primary" /> Friends
      </Button>
    );
  }
  if (isPending) {
    return (
      <Button size="sm" variant="outline" className="gap-1.5 rounded-lg text-muted-foreground" onClick={handleCancel} disabled={loading}>
        <Clock className="w-4 h-4" /> Requested
      </Button>
    );
  }
  if (isReceived) {
    return (
      <div className="flex gap-1.5">
        <Button size="sm" className="gap-1.5 rounded-lg" onClick={handleAccept} disabled={loading}>
          <UserCheck className="w-4 h-4" /> Accept
        </Button>
        <Button size="sm" variant="outline" className="rounded-lg" onClick={handleDecline} disabled={loading}>
          <UserX className="w-4 h-4" />
        </Button>
      </div>
    );
  }
  return (
    <Button size="sm" className="gap-1.5 rounded-lg" onClick={handleAdd} disabled={loading}>
      <UserPlus className="w-4 h-4" /> Add Friend
    </Button>
  );
}