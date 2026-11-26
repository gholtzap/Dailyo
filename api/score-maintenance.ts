import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { cleanupScores, logScoreError } from "../lib/score-store.js";

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  const reply = (status: number, body: unknown) => {
    res.statusCode = status;
    res.end(JSON.stringify(body));
  };
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return reply(405, { error: "Use GET" });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32)
    return reply(503, { error: "Maintenance unavailable" });
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(req.headers.authorization ?? "");
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    return reply(401, { error: "Unauthorized" });
  }
  if (!process.env.DATABASE_URL)
    return reply(503, { error: "Maintenance unavailable" });
  try {
    return reply(200, { deleted: await cleanupScores() });
  } catch (error) {
    logScoreError(
      error instanceof Error ? error : new Error("Maintenance failed"),
    );
    return reply(503, { error: "Maintenance unavailable" });
  }
}
