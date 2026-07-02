// E3-01 — landing screen: name + create / join by code
import { useState } from "react";
import { createRoom, joinRoom } from "../net";
import { useStore } from "../store";

export function Landing() {
  const { name, setName, pushError, busy, setBusy } = useStore();
  const [code, setCode] = useState("");

  const run = async (fn: () => Promise<void>) => {
    if (!name.trim()) return pushError("Pick a name first");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      pushError(e instanceof Error ? e.message : "Connection failed — is the server running?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="landing">
      <h1>Tacan</h1>
      <p className="tagline">settle. trade. betray your friends.</p>
      <input
        placeholder="your name"
        value={name}
        maxLength={16}
        onChange={(e) => setName(e.target.value)}
      />
      <button disabled={busy} onClick={() => run(() => createRoom(name.trim()))}>
        Create room
      </button>
      <div className="join-row">
        <input
          placeholder="room code"
          value={code}
          maxLength={5}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button disabled={busy || code.length !== 5} onClick={() => run(() => joinRoom(code, name.trim()))}>
          Join
        </button>
      </div>
      <p className="fineprint">disconnected mid-game? join again with the same code + name to get your seat back</p>
    </div>
  );
}
