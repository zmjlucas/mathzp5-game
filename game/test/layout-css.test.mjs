import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("arena and tick strip can shrink to mobile viewport width", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");

  assert.match(css, /\.arena-panel\s*{[^}]*min-width:\s*0;/s);
  assert.match(css, /\.arena-panel\s*{[^}]*max-width:\s*100%;/s);
  assert.match(css, /#tick-bar\s*{[^}]*min-width:\s*0;/s);
  assert.match(css, /\.tick-strip button\s*{[^}]*min-width:\s*0;/s);
  assert.match(css, /\.app\s*{[^}]*max-width:\s*100vw;/s);
  assert.match(css, /@media \(max-width:\s*640px\)[\s\S]*\.tick-strip\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(0,\s*1fr\);/);
  assert.match(css, /@media \(max-width:\s*640px\)[\s\S]*grid-template-areas:\s*"label label"\s*"range range"\s*"prev next";/);
  assert.match(css, /@media \(max-width:\s*640px\)[\s\S]*#tick-label\s*{[^}]*grid-area:\s*label;/);
});
