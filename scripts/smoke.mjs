// Real-world smoke: create by code, 3 players, start, first setup move.
import { Client } from "colyseus.js";

const url = "ws://127.0.0.1:2567";
const ana = await new Client(url).create("tacan", { name: "Ana" });
const code = ana.roomId;
let anaState = null;
ana.onMessage("*", (t, m) => { if (String(t) === "state") anaState = m; });

const beto = await new Client(url).joinById(code, { name: "Beto" });
const caro = await new Client(url).joinById(code, { name: "Caro" });
let caroState = null;
caro.onMessage("*", (t, m) => { if (String(t) === "state") caroState = m; });
beto.onMessage("*", () => {});

await new Promise((r) => setTimeout(r, 300));
ana.send("start");
await new Promise((r) => setTimeout(r, 500));
if (!anaState || anaState.phase !== "setup") throw new Error("start failed");

ana.send("action", { type: "placeSetupSettlement", vertex: anaState.board.vertices[0] });
await new Promise((r) => setTimeout(r, 500));
if (!caroState?.buildings?.[anaState.board.vertices[0]]) throw new Error("broadcast failed");

console.log(`SMOKE OK — room ${code}, phase ${caroState.phase}, Caro sees Ana's settlement, devDeckCount=${caroState.devDeckCount}`);
await ana.leave(); await beto.leave(); await caro.leave();
process.exit(0);
