// E7-01 — winners screen: final ranking (hidden VP revealed by the server)
import { PLAYER_COLORS } from "./Board";
import { avatarUrl, portraitUrl } from "../characters";
import { leaveRoom } from "../net";
import { useStore } from "../store";

export function GameOver() {
  const { gameOver, view } = useStore();
  if (!gameOver || !view) return null;
  const ranking = gameOver.finalScores
    .map((score, seat) => ({ seat, score, name: view.players[seat].name }))
    .sort((a, b) => b.score - a.score);
  const avatars = (view as { avatars?: (string | null)[] }).avatars ?? [];
  const winnerAvatar = avatars[gameOver.winner];
  return (
    <div className="gameover">
      {winnerAvatar && <img className="winner-portrait" src={portraitUrl(winnerAvatar)} alt="" />}
      <h1>{view.players[gameOver.winner].name} wins!</h1>
      <ol>
        {ranking.map((r, i) => (
          <li key={r.seat}>
            {avatars[r.seat] ? (
              <img className="face sm" src={avatarUrl(avatars[r.seat]!)} alt="" />
            ) : (
              <span className="chip" style={{ background: PLAYER_COLORS[r.seat] }} />
            )}
            {r.name} — {r.score} VP {i === 0 && "🏆"}
          </li>
        ))}
      </ol>
      <button onClick={() => void leaveRoom()}>back to landing</button>
    </div>
  );
}
