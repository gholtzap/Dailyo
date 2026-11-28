// The browser fixture must serve concurrent asset connections without resets or SYN stalls.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root = await fs.mkdtemp(join(tmpdir(), "dailyo-http-")),
  legacy = process.argv.includes("--legacy");
const payload = Buffer.alloc(65536, 127);
await fs.writeFile(join(root, "fixture.bin"), payload);
const args = legacy
  ? [
      "-u",
      "-m",
      "http.server",
      "0",
      "--protocol",
      "HTTP/1.1",
      "--bind",
      "127.0.0.1",
      "--directory",
      root,
    ]
  : ["scripts/ci-static-server.py", "0", "--directory", root];
const server = spawn("python3", args, { stdio: ["ignore", "pipe", "pipe"] });
let stderr = "";
server.stderr.on("data", (c) => (stderr += c));
try {
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Fixture server did not start: " + stderr)),
      5000,
    );
    server.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("Fixture server exited " + code + ": " + stderr));
    });
    server.stdout.on("data", (chunk) => {
      const match = String(chunk).match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
  });
  const request = (path, method = "GET") =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method,
          agent: false,
          signal: AbortSignal.timeout(2000),
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("error", reject);
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              version: res.httpVersion,
              headers: res.headers,
              body: Buffer.concat(chunks),
            }),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });
  const head = await request("/fixture.bin", "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert.equal(Number(head.headers["content-length"]), payload.length);
  assert.equal(head.version, "1.1");
  assert.equal((await request("/missing.bin")).status, 404);
  assert.deepEqual((await request("/fixture.bin?cache=1")).body, payload);
  const started = performance.now();
  const responses = await Promise.allSettled(
    Array.from({ length: 32 }, () => request("/fixture.bin")),
  );
  const elapsedMs = performance.now() - started;
  const errors = responses
    .filter((r) => r.status === "rejected")
    .map((r) => r.reason.code ?? String(r.reason));
  const receipt = {
    command: `node tests/ci-static-server.mjs${legacy ? " --legacy" : ""}`,
    requests: 32,
    elapsedMs,
    errors,
    correctBodies: responses.filter(
      (r) =>
        r.status === "fulfilled" &&
        r.value.status === 200 &&
        r.value.body.equals(payload),
    ).length,
  };
  await fs.mkdir("test-results/ci-optimization", { recursive: true });
  await fs.writeFile(
    `test-results/ci-optimization/static-server${legacy ? "-legacy" : ""}.json`,
    JSON.stringify(receipt, null, 2),
  );
  console.log(JSON.stringify(receipt));
  assert.deepEqual(errors, [], "Concurrent asset connections must not reset");
  assert.equal(receipt.correctBodies, 32);
  assert.ok(
    elapsedMs < 1000,
    "Concurrent loopback assets must finish before TCP retransmission delays",
  );
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    server.kill();
    await exited;
  }
  await fs.rm(root, { recursive: true, force: true });
}
