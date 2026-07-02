// @vitest-environment jsdom
// E4-01/02/03 — the board renders 100% from server state and emits click intents
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { applyAction, createGame } from "@tacan/rules";
import { redactStateFor } from "@tacan/server/view";
import { Board } from "../src/components/Board";

const game = createGame({ playerNames: ["Ana", "Beto", "Caro"], seed: 9 });
const view = redactStateFor(game, 0);

describe("E4 board renderer", () => {
  it("renders 19 tiles, 18 tokens, 9 ports, 54 vertex slots, 72 edge slots, 1 robber", () => {
    const { container, getByTestId } = render(<Board view={view} />);
    expect(container.querySelectorAll(".tile")).toHaveLength(19);
    expect(container.querySelectorAll(".tile circle")).toHaveLength(18); // desert has no token
    expect(container.querySelectorAll(".port")).toHaveLength(9);
    expect(container.querySelectorAll(".vertex-slot")).toHaveLength(54);
    expect(container.querySelectorAll(".edge-slot")).toHaveLength(72);
    expect(getByTestId("robber")).toBeTruthy();
    cleanup();
  });

  it("emits vertex/edge/tile click intents with engine ids", () => {
    const onVertex = vi.fn();
    const onEdge = vi.fn();
    const onTile = vi.fn();
    const { container } = render(<Board view={view} onVertexClick={onVertex} onEdgeClick={onEdge} onTileClick={onTile} />);
    fireEvent.click(container.querySelector(".vertex-slot")!);
    fireEvent.click(container.querySelector(".edge-slot")!);
    fireEvent.click(container.querySelector(".tile")!);
    expect(onVertex).toHaveBeenCalledWith(view.board.vertices[0]);
    expect(onEdge).toHaveBeenCalledTimes(1);
    expect(onTile).toHaveBeenCalledWith(view.board.tiles[0].id);
    cleanup();
  });

  it("draws buildings and roads once the server state contains them", () => {
    let g = applyAction(game, 0, { type: "placeSetupSettlement", vertex: game.board.vertices[0] });
    const edge = g.board.vertexEdges[g.board.vertices[0]][0];
    g = applyAction(g, 0, { type: "placeSetupRoad", edge });
    const v2 = redactStateFor(g, 1); // an opponent sees the same public board
    const { container } = render(<Board view={v2} />);
    expect(container.querySelector(`[data-testid="bld-${g.board.vertices[0]}"]`)).toBeTruthy();
    expect(container.querySelector(`[data-testid="road-${edge}"]`)).toBeTruthy();
    expect(container.querySelectorAll(".vertex-slot")).toHaveLength(53); // one slot became a building
    cleanup();
  });
});
