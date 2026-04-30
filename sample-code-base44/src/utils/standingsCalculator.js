/**
 * Calculate group standings from match results and points rules
 * @param {Array} entries - CompetitionEntry objects
 * @param {Array} matches - Confirmed CompetitionMatch objects
 * @param {Object} pointsRules - { points_win, points_loss, points_draw }
 * @param {String} teamStructure - "singles" or "doubles"
 * @returns {Array} Sorted standings with stats
 */
export function calculateGroupStandings(entries, matches, pointsRules, teamStructure = "singles") {
  const isDoubles = teamStructure === "doubles" || teamStructure === "mixed_doubles";

  // Initialize standings for each player/team
  const standings = {};

  entries.forEach((entry) => {
    const key = isDoubles ? entry.id : entry.player_email;
    standings[key] = {
      entry_id: entry.id,
      player_email: entry.player_email,
      player_name: entry.player_name,
      is_doubles: isDoubles,
      matches_played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      sets_won: 0,
      sets_lost: 0,
      games_won: 0,
      games_lost: 0,
      points: 0,
    };
  });

  // Process confirmed matches
  matches.forEach((match) => {
    if (match.status !== "confirmed") return;

    const scoreA = (match.score_player1 || "").split(",").map(Number).filter(Boolean);
    const scoreB = (match.score_player2 || "").split(",").map(Number).filter(Boolean);

    // Determine winner(s)
    let winner = null;
    let loser = null;
    let isDraw = false;

    if (isDoubles) {
      // Doubles: use winner_team
      if (match.winner_team === "team_a") {
        winner = match.team_a_emails;
        loser = match.team_b_emails;
      } else if (match.winner_team === "team_b") {
        winner = match.team_b_emails;
        loser = match.team_a_emails;
      }
    } else {
      // Singles: use winner_email
      if (match.winner_email === match.player1_email) {
        winner = [match.player1_email];
        loser = [match.player2_email];
      } else if (match.winner_email === match.player2_email) {
        winner = [match.player2_email];
        loser = [match.player1_email];
      }
    }

    if (!winner || !loser) return;

    // Calculate sets and games won/lost
    const setsWonA = scoreA.filter((s, i) => s > (scoreB[i] || 0)).length;
    const setsWonB = scoreB.filter((s, i) => s > (scoreA[i] || 0)).length;
    const gamesWonA = scoreA.reduce((sum, s) => sum + s, 0);
    const gamesWonB = scoreB.reduce((sum, s) => sum + s, 0);

    // Award points to winner(s) and loser(s)
    winner.forEach((email) => {
      const key = isDoubles ? email : email; // For doubles, use email still; standings key is entry_id
      const winnerEntry = entries.find((e) => (isDoubles ? e.player_email === email : e.player_email === email));
      if (winnerEntry) {
        const standingKey = winnerEntry.id;
        if (standings[standingKey]) {
          standings[standingKey].matches_played += 1;
          standings[standingKey].wins += 1;
          standings[standingKey].sets_won += setsWonA;
          standings[standingKey].sets_lost += setsWonB;
          standings[standingKey].games_won += gamesWonA;
          standings[standingKey].games_lost += gamesWonB;
          standings[standingKey].points += pointsRules.points_win || 3;
        }
      }
    });

    loser.forEach((email) => {
      const loserEntry = entries.find((e) => (isDoubles ? e.player_email === email : e.player_email === email));
      if (loserEntry) {
        const standingKey = loserEntry.id;
        if (standings[standingKey]) {
          standings[standingKey].matches_played += 1;
          standings[standingKey].losses += 1;
          standings[standingKey].sets_won += setsWonB;
          standings[standingKey].sets_lost += setsWonA;
          standings[standingKey].games_won += gamesWonB;
          standings[standingKey].games_lost += gamesWonA;
          standings[standingKey].points += pointsRules.points_loss || 0;
        }
      }
    });
  });

  // Sort by points (desc), then set difference (desc), then games difference (desc)
  const sorted = Object.values(standings).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const aDiff = a.sets_won - a.sets_lost;
    const bDiff = b.sets_won - b.sets_lost;
    if (bDiff !== aDiff) return bDiff - aDiff;
    const aGames = a.games_won - a.games_lost;
    const bGames = b.games_won - b.games_lost;
    return bGames - aGames;
  });

  return sorted;
}