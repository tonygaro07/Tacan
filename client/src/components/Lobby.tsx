// E3-04 lobby + E3-02 character selection (Ivalice: Ninth Shard roster).
// Avatars are pure cosmetics — the server enforces one claim per character.
import { CHARACTERS, avatarUrl } from "../characters";
import { spawnBots } from "../bots";
import { leaveRoom, sendAvatar, sendStart } from "../net";
import { useStore } from "../store";

export function Lobby() {
  const { lobby, name } = useStore();
  if (!lobby) return null;
  const isHost = lobby.host === name;
  const avatars = lobby.avatars ?? {};
  const claimedBy = (id: string) => Object.entries(avatars).find(([, a]) => a === id)?.[0];
  const mine = avatars[name];

  return (
    <div className="lobby wide">
      <h2>room code</h2>
      <div className="room-code">{lobby.code}</div>
      <p className="muted">share it — friends join from the landing screen</p>

      <ul className="joined">
        {lobby.players.map((p) => (
          <li key={p}>
            {avatars[p] ? (
              <img className="face sm" src={avatarUrl(avatars[p])} alt="" />
            ) : (
              <span className="face sm empty">?</span>
            )}
            {p} {p === lobby.host && <span className="tag">host</span>} {p === name && <span className="tag you">you</span>}
          </li>
        ))}
      </ul>

      <h3>pick your character</h3>
      <div className="avatar-grid">
        {CHARACTERS.map((c) => {
          const owner = claimedBy(c.id);
          const isMine = mine === c.id;
          const taken = !!owner && !isMine;
          return (
            <button
              key={c.id}
              className={`avatar-card ${isMine ? "mine" : ""} ${taken ? "taken" : ""}`}
              style={{ borderColor: isMine ? c.accent : undefined }}
              disabled={taken}
              title={`${c.name} — ${c.classTag} (${c.player})`}
              onClick={() => sendAvatar(c.id)}
            >
              <img src={avatarUrl(c.id)} alt={c.name} loading="lazy" />
              <span className="avatar-name" style={{ color: c.accent }}>{c.name}</span>
              {owner && <span className="avatar-owner">{isMine ? "you" : owner}</span>}
            </button>
          );
        })}
      </div>

      {isHost && lobby.players.length < 3 && (
        <button onClick={() => void spawnBots(lobby.code, 3 - lobby.players.length)}>
          🤖 simulate {3 - lobby.players.length} test player{3 - lobby.players.length > 1 ? "s" : ""} (auto-play)
        </button>
      )}
      {isHost ? (
        <button className="primary" disabled={lobby.players.length < 3} onClick={sendStart}>
          {lobby.players.length < 3 ? `need ${3 - lobby.players.length} more` : `Start (${lobby.players.length} players)`}
        </button>
      ) : (
        <p className="muted">waiting for {lobby.host} to start…</p>
      )}
      <button className="ghost" onClick={() => void leaveRoom()}>leave</button>
    </div>
  );
}
