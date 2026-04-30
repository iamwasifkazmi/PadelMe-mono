import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Layout from './components/Layout';
import Home from './pages/Home';
import FindMatch from './pages/FindMatch';
import CreateMatch from './pages/CreateMatch';
import MatchDetail from './pages/MatchDetail';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import EditProfile from './pages/EditProfile';
import Notifications from './pages/Notifications';
import Competitions from './pages/Competitions';
import CreateCompetition from './pages/CreateCompetition';
import CompetitionDetail from './pages/CompetitionDetail';
import AdminTestMode from './pages/AdminTestMode';
import InvitePlayers from './pages/InvitePlayers';
import AcceptInvite from './pages/AcceptInvite';
import Verification from './pages/Verification';
import AdminIDReview from './pages/AdminIDReview';
import InstantPlay from './pages/InstantPlay.jsx';
import Onboarding from './pages/Onboarding';
import Players from './pages/Players';
import PlayerProfile from './pages/PlayerProfile';
import Friends from './pages/Friends';
import Messages from './pages/Messages';
import ConversationView from './pages/ConversationView';
import PastEvents from './pages/PastEvents';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/find-match" element={<FindMatch />} />
        <Route path="/create-match" element={<CreateMatch />} />
        <Route path="/match/:id" element={<MatchDetail />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/edit-profile" element={<EditProfile />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/competitions" element={<Competitions />} />
        <Route path="/create-competition" element={<CreateCompetition />} />
        <Route path="/competition/:id" element={<CompetitionDetail />} />
        <Route path="/admin/test" element={<AdminTestMode />} />
        <Route path="/invite" element={<InvitePlayers />} />
        <Route path="/verification" element={<Verification />} />
        <Route path="/admin/id-review" element={<AdminIDReview />} />
        <Route path="/instant-play" element={<InstantPlay />} />
        <Route path="/players" element={<Players />} />
        <Route path="/player/:id" element={<PlayerProfile />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/past-events" element={<PastEvents />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="*" element={<PageNotFound />} />
      </Route>
      {/* Full-screen routes without layout */}
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/conversation/:id" element={<ConversationView />} />
      <Route path="/chat/:matchId" element={<Chat />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App