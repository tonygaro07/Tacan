// ---------------------------------------------------------------------------
// E5-01..08 — gameplay UI. The client renders server state and sends intents;
// affordability greying is a UX convenience — the server re-validates all of it.
// ---------------------------------------------------------------------------
import { useMemo, useState } from "react";
import { bankTradeRatio, COSTS, GameState, RESOURCES, Resource, ResourceCount } from "@tacan/rules";
import type { ClientView, SelfView } from "@tacan/server/view";
import { sendAction } from "../net";
import { useStore } from "../store";
import { Board, PLAYER_COLORS } from "./Board";
import { avatarUrl, characterById } from "../characters";

const RES_EMOJI: Record<Resource, string> = { wood: "🌲", brick: "🧱", sheep: "🐑", wheat: "🌾", ore: "⛰️" };

const canAfford = (hand: ResourceCount, cost: Partial<ResourceCount>): boolean =>
  RESOURCES.every((r) => hand[r] >= (cost[r] ?? 0));

export function Game() {
  const view = useStore((s) => s.view);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  if (!view) return null;

  const me = view.yourSeat;
  const my = view.players[me] as SelfView;
  const myTurn = view.currentPlayer === me;
  const mustDiscard = view.pendingDiscards[me] !== undefined;

  const onVertexClick = (vertex: string) => {
    if (!myTurn) return;
    if (view.phase === "setup" && !view.awaitingSetupRoad) sendAction({ type: "placeSetupSettlement", vertex });
    else if (view.phase === "main" && mode === "settlement") sendAction({ type: "buildSettlement", vertex });
    else if (view.phase === "main" && mode === "city") sendAction({ type: "buildCity", vertex });
  };
  const onEdgeClick = (edge: string) => {
    if (!myTurn) return;
    if (view.phase === "setup" && view.awaitingSetupRoad) sendAction({ type: "placeSetupRoad", edge });
    else if (view.phase === "main" && (mode === "road" || view.pendingFreeRoads > 0)) sendAction({ type: "buildRoad", edge });
  };
  const onTileClick = (tile: string) => {
    if (myTurn && view.phase === "moveRobber") sendAction({ type: "moveRobber", tile });
  };

  const hint = !myTurn
    ? `${view.players[view.currentPlayer].name}'s turn (${view.phase})`
    : view.phase === "setup"
      ? view.awaitingSetupRoad ? "place a road touching your new settlement" : "place a settlement (click a corner)"
      : view.phase === "roll" ? "roll the dice"
      : view.phase === "moveRobber" ? "move the robber (click a tile)"
      : view.phase === "steal" ? "pick someone to rob"
      : view.pendingFreeRoads > 0 ? `place ${view.pendingFreeRoads} free road${view.pendingFreeRoads > 1 ? "s" : ""}`
      : mode ? `click the board to build a ${mode}` : "trade, build, or end your turn";

  return (
    <div className="game">
      <div className="board-wrap">
        <Board view={view} onVertexClick={onVertexClick} onEdgeClick={onEdgeClick} onTileClick={onTileClick} />
        <div className="hint">{hint}</div>
      </div>
      <aside className="side">
        <Players view={view} />
        <Dice view={view} myTurn={myTurn} />
        <Hand my={my} />
        {myTurn && view.phase === "main" && <ActionBar view={view} my={my} />}
        {myTurn && view.phase === "steal" && <StealPicker view={view} me={me} />}
        {view.tradeOffer && <TradeBanner view={view} me={me} />}
        <Log view={view} />
      </aside>
      {mustDiscard && <DiscardModal my={my} required={view.pendingDiscards[me]} />}
    </div>
  );
}

// --- E5-06: players + turn indicator ---------------------------------------
function Players({ view }: { view: ClientView }) {
  return (
    <div className="panel players">
      {view.players.map((p, i) => {
        const vp =
          p.settlements.length + 2 * p.cities.length +
          (view.longestRoad.holder === i ? 2 : 0) + (view.largestArmy.holder === i ? 2 : 0);
        return (
          <div key={i} className={`player-row ${view.currentPlayer === i ? "current" : ""}`}>
            {(view as { avatars?: (string | null)[] }).avatars?.[i] ? (
              <img className="face sm" src={avatarUrl((view as { avatars?: (string | null)[] }).avatars![i]!)} alt=""
                style={{ borderColor: characterById((view as { avatars?: (string | null)[] }).avatars![i])?.accent ?? PLAYER_COLORS[i] }} />
            ) : (
              <span className="chip" style={{ background: PLAYER_COLORS[i] }} />
            )}
            <span className="pname">{p.name}{i === view.yourSeat ? " (you)" : ""}</span>
            <span title="victory points (visible)">⭐{vp}</span>
            <span title="cards in hand">🂠{p.resourceCount}</span>
            <span title="dev cards">🎴{p.devCardCount}</span>
            <span title="knights played">⚔️{p.playedKnights}</span>
            {view.longestRoad.holder === i && <span className="tag" title="Longest Road">LR</span>}
            {view.largestArmy.holder === i && <span className="tag" title="Largest Army">LA</span>}
          </div>
        );
      })}
    </div>
  );
}

// --- E5-01: dice ------------------------------------------------------------
function Dice({ view, myTurn }: { view: ClientView; myTurn: boolean }) {
  return (
    <div className="panel dice">
      {view.dice ? <span className="dice-val">🎲 {view.dice[0]} + {view.dice[1]} = {view.dice[0] + view.dice[1]}</span> : <span className="dice-val">🎲 —</span>}
      {myTurn && view.phase === "roll" && (
        <button className="primary" onClick={() => sendAction({ type: "roll" })}>Roll dice</button>
      )}
    </div>
  );
}

// --- E5-02: hand tray --------------------------------------------------------
function Hand({ my }: { my: SelfView }) {
  return (
    <div className="panel hand">
      {RESOURCES.map((r) => (
        <span key={r} className="res" title={r}>{RES_EMOJI[r]} {my.resources[r]}</span>
      ))}
    </div>
  );
}

// --- E5-03/04/05: build menu, trade, dev cards -------------------------------
function ActionBar({ view, my }: { view: ClientView; my: SelfView }) {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [devPick, setDevPick] = useState<"monopoly" | "yearOfPlenty" | null>(null);

  const playable = (t: string) =>
    !view.playedDevThisTurn && my.devCards.some((c) => c.type === t && c.boughtOnTurn < view.turn);

  return (
    <div className="panel actions">
      <div className="row">
        <button className={mode === "road" ? "on" : ""} disabled={view.pendingFreeRoads === 0 && !canAfford(my.resources, COSTS.road)}
          onClick={() => setMode("road")}>🛤 road</button>
        <button className={mode === "settlement" ? "on" : ""} disabled={!canAfford(my.resources, COSTS.settlement)}
          onClick={() => setMode("settlement")}>🏠 settle</button>
        <button className={mode === "city" ? "on" : ""} disabled={!canAfford(my.resources, COSTS.city)}
          onClick={() => setMode("city")}>🏰 city</button>
        <button disabled={!canAfford(my.resources, COSTS.devCard)} onClick={() => sendAction({ type: "buyDevCard" })}>🎴 buy dev</button>
      </div>
      <div className="row">
        {(["knight", "roadBuilding", "yearOfPlenty", "monopoly"] as const).map((card) => {
          const count = my.devCards.filter((c) => c.type === card).length;
          if (count === 0) return null;
          return (
            <button key={card} disabled={!playable(card)}
              onClick={() => {
                if (card === "monopoly" || card === "yearOfPlenty") setDevPick(card);
                else sendAction({ type: "playDevCard", card });
              }}>
              {card} ×{count}
            </button>
          );
        })}
        {my.devCards.some((c) => c.type === "victoryPoint") && (
          <span className="tag" title="hidden victory points">
            +{my.devCards.filter((c) => c.type === "victoryPoint").length} VP hidden
          </span>
        )}
      </div>
      {devPick && <DevPick card={devPick} close={() => setDevPick(null)} />}
      <div className="row">
        <button onClick={() => setTradeOpen(!tradeOpen)}>⇄ trade</button>
        <button className="primary" onClick={() => sendAction({ type: "endTurn" })}>end turn</button>
      </div>
      {tradeOpen && <TradePanel view={view} my={my} />}
    </div>
  );
}

function DevPick({ card, close }: { card: "monopoly" | "yearOfPlenty"; close: () => void }) {
  const [r1, setR1] = useState<Resource>("wood");
  const [r2, setR2] = useState<Resource>("wood");
  return (
    <div className="row">
      <ResSelect value={r1} onChange={setR1} />
      {card === "yearOfPlenty" && <ResSelect value={r2} onChange={setR2} />}
      <button className="primary" onClick={() => {
        if (card === "monopoly") sendAction({ type: "playDevCard", card, resource: r1 });
        else sendAction({ type: "playDevCard", card, resources: [r1, r2] });
        close();
      }}>play {card}</button>
    </div>
  );
}

function ResSelect({ value, onChange }: { value: Resource; onChange: (r: Resource) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Resource)}>
      {RESOURCES.map((r) => <option key={r} value={r}>{RES_EMOJI[r]} {r}</option>)}
    </select>
  );
}

// --- E5-04: trade (bank/port + player offers) --------------------------------
function TradePanel({ view, my }: { view: ClientView; my: SelfView }) {
  const [give, setGive] = useState<Resource>("wood");
  const [want, setWant] = useState<Resource>("brick");
  const [offerGive, setOfferGive] = useState<Partial<ResourceCount>>({});
  const [offerWant, setOfferWant] = useState<Partial<ResourceCount>>({});
  // bankTradeRatio only reads ports + settlements/cities — safe on the view
  const ratio = bankTradeRatio(view as unknown as GameState, view.yourSeat, give);
  const stepper = (state: Partial<ResourceCount>, set: (v: Partial<ResourceCount>) => void) => (
    <div className="row wrap">
      {RESOURCES.map((r) => (
        <label key={r} className="mini">
          {RES_EMOJI[r]}
          <input type="number" min={0} max={19} value={state[r] ?? 0}
            onChange={(e) => set({ ...state, [r]: Number(e.target.value) || 0 })} />
        </label>
      ))}
    </div>
  );
  return (
    <div className="trade">
      <div className="row">
        <ResSelect value={give} onChange={setGive} />
        <span>→</span>
        <ResSelect value={want} onChange={setWant} />
        <button disabled={my.resources[give] < ratio || give === want}
          onClick={() => sendAction({ type: "bankTrade", give, want })}>bank {ratio}:1</button>
      </div>
      <div className="offer">
        <span className="muted">offer friends — you give:</span>
        {stepper(offerGive, setOfferGive)}
        <span className="muted">you want:</span>
        {stepper(offerWant, setOfferWant)}
        <button onClick={() => sendAction({ type: "offerTrade", give: offerGive, want: offerWant })}>post offer</button>
      </div>
    </div>
  );
}

function TradeBanner({ view, me }: { view: ClientView; me: number }) {
  const offer = view.tradeOffer!;
  const fmt = (c: Partial<ResourceCount>) =>
    RESOURCES.filter((r) => (c[r] ?? 0) > 0).map((r) => `${c[r]}${RES_EMOJI[r]}`).join(" ") || "nothing";
  return (
    <div className="panel banner">
      <span>{view.players[offer.from].name} offers {fmt(offer.give)} for {fmt(offer.want)}</span>
      {offer.from !== me && <button className="primary" onClick={() => sendAction({ type: "acceptTrade" })}>accept</button>}
      {(offer.from === me || view.currentPlayer === me) && (
        <button onClick={() => sendAction({ type: "cancelTrade" })}>cancel</button>
      )}
    </div>
  );
}

// --- E5-07: discard modal -----------------------------------------------------
function DiscardModal({ my, required }: { my: SelfView; required: number }) {
  const [picks, setPicks] = useState<Partial<ResourceCount>>({});
  const total = RESOURCES.reduce((s, r) => s + (picks[r] ?? 0), 0);
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>a 7! discard {required} cards</h3>
        <div className="row wrap">
          {RESOURCES.map((r) => (
            <label key={r} className="mini">
              {RES_EMOJI[r]} ({my.resources[r]})
              <input type="number" min={0} max={my.resources[r]} value={picks[r] ?? 0}
                onChange={(e) => setPicks({ ...picks, [r]: Math.min(Number(e.target.value) || 0, my.resources[r]) })} />
            </label>
          ))}
        </div>
        <button className="primary" disabled={total !== required}
          onClick={() => sendAction({ type: "discard", resources: picks })}>
          discard {total}/{required}
        </button>
      </div>
    </div>
  );
}

// --- E5-08: steal target picker -------------------------------------------------
function StealPicker({ view, me }: { view: ClientView; me: number }) {
  const victims = useMemo(() => {
    const seats = new Set<number>();
    for (const v of view.board.tileVertices[view.board.robberTile]) {
      const b = view.buildings[v];
      if (b && b.player !== me && view.players[b.player].resourceCount > 0) seats.add(b.player);
    }
    return [...seats];
  }, [view, me]);
  return (
    <div className="panel">
      <h3>rob someone:</h3>
      <div className="row">
        {victims.map((seat) => (
          <button key={seat} onClick={() => sendAction({ type: "steal", target: seat })}>
            <span className="chip" style={{ background: PLAYER_COLORS[seat] }} /> {view.players[seat].name}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- E5-06: action log ------------------------------------------------------------
function Log({ view }: { view: ClientView }) {
  return (
    <div className="panel log">
      {view.log.slice(-8).map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
}
