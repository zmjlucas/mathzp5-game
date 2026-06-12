import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("index.html provides every element required by the game controller", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const requiredIds = [
    "arena",
    "tick-bar",
    "tick-label",
    "play",
    "pause",
    "previous-tick",
    "next-tick",
    "reset",
    "undo",
    "redo",
    "turn-left",
    "turn-right",
    "accelerate",
    "decelerate",
    "turn-angle",
    "turn-angle-value",
    "direction",
    "direction-value",
    "layers",
    "layers-value",
    "rotating",
    "speed",
    "distance",
    "time",
  ];

  for (const id of requiredIds) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }

  assert.doesNotMatch(html, />Obstacle Game</);
  assert.doesNotMatch(html, />Triangular-grid escape</);
  assert.doesNotMatch(html, /class="reference"/);
  assert.doesNotMatch(html, /id="status"/);
  assert.doesNotMatch(html, /id="card-count"/);
  assert.doesNotMatch(html, /id="nearest"/);
});
