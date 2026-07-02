// @colyseus/tools is also CJS — same createRequire interop as TacanRoom.
import { createRequire } from "node:module";
import { TacanRoom } from "./rooms/TacanRoom.js";

const tools = createRequire(import.meta.url)("@colyseus/tools");
const config = (tools.default ?? tools) as (opts: {
  initializeGameServer?: (gameServer: { define: (name: string, room: unknown) => void }) => void;
}) => unknown;

export default config({
  initializeGameServer: (gameServer) => {
    gameServer.define("tacan", TacanRoom);
  },
});
