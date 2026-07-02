import { GameOver } from "./components/GameOver";
import { Game } from "./components/Game";
import { Landing } from "./components/Landing";
import { Lobby } from "./components/Lobby";
import { useStore } from "./store";

export default function App() {
  const { screen, errors, code } = useStore();
  return (
    <div className="app">
      {code && screen !== "landing" && <div className="topbar">Tacan · room {code}</div>}
      {screen === "landing" && <Landing />}
      {screen === "lobby" && <Lobby />}
      {screen === "game" && <Game />}
      {screen === "gameover" && <GameOver />}
      <div className="toasts">
        {errors.map((e, i) => (
          <div key={i} className="toast">{e}</div>
        ))}
      </div>
    </div>
  );
}
