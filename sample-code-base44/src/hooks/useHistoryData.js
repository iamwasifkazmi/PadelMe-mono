/**
 * useHistoryData — shared hook that merges completed matches + competitions
 * into a single sorted history list for use across Past Events, Profile, and Performance tabs.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export function useHistoryData(userEmail) {
  const enabled = !!userEmail;

  const { data: completedMatches = [], isLoading: loadingMatches } = useQuery({
    queryKey: ["past-matches", userEmail],
    queryFn: async () => {
      const results = await Promise.all([
        base44.entities.Match.filter({ status: "completed" }, "-date", 100),
        base44.entities.Match.filter({ status: "abandoned" }, "-date", 20),
        base44.entities.Match.filter({ status: "cancelled" }, "-date", 20),
      ]);
      return results.flat().filter(
        m => m.players?.includes(userEmail) || m.created_by === userEmail
      );
    },
    enabled,
  });

  const { data: completedCompetitions = [], isLoading: loadingComps } = useQuery({
    queryKey: ["past-competitions", userEmail],
    queryFn: async () => {
      const results = await Promise.all([
        base44.entities.Competition.filter({ status: "completed" }, "-end_date", 50),
        base44.entities.Competition.filter({ status: "cancelled" }, "-end_date", 20),
      ]);
      return results.flat().filter(
        c => c.participants?.includes(userEmail) || c.host_email === userEmail
      );
    },
    enabled,
  });

  const { data: recentForm = [], isLoading: loadingForm } = useQuery({
    queryKey: ["recent-form", userEmail],
    queryFn: () => base44.entities.PlayerRecentForm.filter({ user_email: userEmail }, "-match_date", 100),
    enabled,
  });

  const { data: myRatings = [] } = useQuery({
    queryKey: ["my-ratings", userEmail],
    queryFn: () => base44.entities.Rating.filter({ rater_email: userEmail }, "-created_date", 200),
    enabled,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["all-users"],
    queryFn: () => base44.entities.User.list(),
    enabled,
  });

  // ELO change map keyed by match_id
  const eloChangeMap = useMemo(() => {
    const map = {};
    recentForm.forEach(r => { if (r.match_id) map[r.match_id] = { change: r.elo_change, after: r.elo_after }; });
    return map;
  }, [recentForm]);

  // Normalise matches → unified history items
  const matchItems = useMemo(() => completedMatches.map(m => {
    const myTeam = m.team_a?.includes(userEmail) ? "team_a" : m.team_b?.includes(userEmail) ? "team_b" : null;
    let result = "played";
    if (m.status === "cancelled") result = "cancelled";
    else if (m.winner_team && myTeam) result = m.winner_team === myTeam ? "win" : "loss";
    else if (m.winner_email) result = m.winner_email === userEmail ? "win" : (m.players?.includes(userEmail) ? "loss" : "played");

    const elo = eloChangeMap[m.id];
    return {
      id: m.id,
      _type: "match",
      _raw: m,
      name: m.title,
      eventType: m.match_type === "doubles" || m.match_type === "mixed_doubles" ? "Doubles Match" : "Singles Match",
      date: m.date || m.created_date,
      location: m.location_name,
      result,
      status: m.status,
      scoreA: m.score_team_a || m.submitted_score_a,
      scoreB: m.score_team_b || m.submitted_score_b,
      eloChange: elo?.change ?? null,
      eloAfter: elo?.after ?? null,
      teamA: m.team_a || [],
      teamB: m.team_b || [],
      players: m.players || [],
      myTeam,
      detailUrl: `/match/${m.id}`,
    };
  }), [completedMatches, eloChangeMap, userEmail]);

  // Normalise competitions → unified history items
  const competitionItems = useMemo(() => completedCompetitions.map(c => {
    const typeLabel = c.type === "league" ? "League" : c.type === "tournament" ? "Tournament" : "Competition";
    return {
      id: c.id,
      _type: "competition",
      _raw: c,
      name: c.name,
      eventType: typeLabel,
      date: c.end_date || c.start_date || c.created_date,
      location: c.location_name,
      result: c.status === "cancelled" ? "cancelled" : "played",
      status: c.status,
      scoreA: null,
      scoreB: null,
      eloChange: null,
      eloAfter: null,
      teamA: [],
      teamB: [],
      players: c.participants || [],
      myTeam: null,
      detailUrl: `/competition/${c.id}`,
      // competition-specific
      playerCount: c.participants?.length || 0,
      maxPlayers: c.max_players,
    };
  }), [completedCompetitions]);

  // Merge and sort newest first
  const allHistory = useMemo(() => {
    return [...matchItems, ...competitionItems].sort(
      (a, b) => new Date(b.date || 0) - new Date(a.date || 0)
    );
  }, [matchItems, competitionItems]);

  return {
    allHistory,
    matchItems,
    competitionItems,
    recentForm,
    myRatings,
    allUsers,
    eloChangeMap,
    isLoading: loadingMatches || loadingComps || loadingForm,
  };
}