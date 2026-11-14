import { before, after } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "../server.mjs";
import { apiContract } from "./api-contract.mjs";

const TOKEN = "test-token-123";
let home, server, base;

before(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "jee-home-"));
  const pub = fs.mkdtempSync(path.join(os.tmpdir(), "jee-pub-"));
  fs.mkdirSync(path.join(pub, "fonts"));
  fs.writeFileSync(path.join(pub, "index.html"), "<p>key=__SYNC_TOKEN__</p>");
  fs.writeFileSync(path.join(pub, "fonts", "ibm-plex-mono-400.woff2"), "FONT");
  fs.writeFileSync(path.join(home, "config.json"), "{}");
  server = createServer({ home, publicDir: pub, token: TOKEN });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

apiContract("node server", { base: () => base, token: () => TOKEN, home: () => home });
