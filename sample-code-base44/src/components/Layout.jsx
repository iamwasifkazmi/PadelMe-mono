import { useState, useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { Home, Search, Plus, Users, User, MessageCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import CreateActionSheet from "./CreateActionSheet";

function NavTab({ tab, isActive }) {
  return (
    <Link
      to={tab.path}
      className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all relative ${
        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <div className="relative">
        <tab.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
        {tab.badge > 0 && (
          <span className="absolute -top-1.5 -right-2 bg-accent text-accent-foreground text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
            {tab.badge > 9 ? "9+" : tab.badge}
          </span>
        )}
      </div>
      <span className={`text-[10px] font-medium ${isActive ? "font-semibold" : ""}`}>
        {tab.label}
      </span>
    </Link>
  );
}

export default function Layout() {
  const location = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then((u) => {
      setCurrentUser(u);
      // Ping last_active_at so other users see correct status
      if (u) base44.auth.updateMe({ last_active_at: new Date().toISOString() }).catch(() => {});
    });
  }, []);

  const { data: notifications = [] } = useQuery({
    queryKey: ["unread-notifications"],
    queryFn: async () => {
      const user = await base44.auth.me();
      return base44.entities.Notification.filter(
        { user_email: user.email, is_read: false },
        "-created_date",
        50
      );
    },
    refetchInterval: 30000,
  });

  const { data: friendRequests = [] } = useQuery({
    queryKey: ["friend-requests"],
    queryFn: async () => {
      const user = await base44.auth.me();
      return base44.entities.FriendRequest.filter({ recipient_email: user.email, status: "pending" }, "-created_date", 50);
    },
    refetchInterval: 15000,
    enabled: !!currentUser,
  });

  const { data: unreadMessages = [] } = useQuery({
    queryKey: ["unread-messages-nav", currentUser?.email],
    queryFn: async () => {
      const user = await base44.auth.me();
      const msgs = await base44.entities.Message.list("-created_date", 200);
      return msgs.filter((m) => m.sender_email !== user.email && !(m.read_by || []).includes(user.email));
    },
    refetchInterval: 30000,
    enabled: !!currentUser,
  });

  const pendingRequestCount = friendRequests.length;
  const unreadMessageCount = unreadMessages.length;

  const tabs = [
    { path: "/", icon: Home, label: "Home" },
    { path: "/find-match", icon: Search, label: "Discover" },
    { path: "/messages", icon: MessageCircle, label: "Messages", badge: unreadMessageCount },
    { path: "/profile", icon: User, label: "Profile" },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">

      <main className="flex-1 pb-20 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
        <div className="max-w-lg mx-auto flex items-center justify-around h-16">
          {/* First two tabs */}
          {tabs.slice(0, 2).map((tab) => <NavTab key={tab.path} tab={tab} isActive={location.pathname === tab.path} />)}

          {/* Centre + button */}
          <button
            key="create"
            onClick={() => setShowCreate(true)}
            className="flex flex-col items-center justify-center"
          >
            <div className="w-[52px] h-[52px] -mt-5 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/40 active:scale-95 transition-transform">
              <Plus className="w-7 h-7 text-primary-foreground stroke-[2.5]" />
            </div>
          </button>

          {/* Last two tabs */}
          {tabs.slice(2).map((tab) => <NavTab key={tab.path} tab={tab} isActive={location.pathname === tab.path} />)}
        </div>
      </nav>

      {/* Create Action Sheet */}
      {showCreate && (
        <CreateActionSheet user={currentUser} onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}