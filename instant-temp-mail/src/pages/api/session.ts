import type { NextApiRequest, NextApiResponse } from "next";
import { createSession, getSession } from "../../lib/store";

type Data =
  | { error: string }
  | {
      session: ReturnType<typeof createSession>;
    };

export default function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  if (req.method === "POST") {
    const ttlOption = Number(req.body?.ttl);
    const ttl = [600, 3600, 86400].includes(ttlOption) ? ttlOption : 3600;
    const session = createSession(ttl);
    return res.status(201).json({ session });
  }

  if (req.method === "GET") {
    const sessionId = (req.query.sessionId as string) ?? "";
    if (!sessionId) {
      return res.status(400).json({ error: "Missing session" });
    }
    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    return res.status(200).json({ session });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
