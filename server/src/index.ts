// Boot entry (npm run dev). E9-03 note: deploy this on a persistent-connection
// host (Fly.io/Railway/Render) — NOT serverless. WebSocket rooms need a
// long-running process.
import { createRequire } from "node:module";
import appConfig from "./app.config.js";

const { listen } = createRequire(import.meta.url)("@colyseus/tools") as typeof import("@colyseus/tools");

void listen(appConfig as Parameters<typeof listen>[0], Number(process.env.PORT ?? 2567));
