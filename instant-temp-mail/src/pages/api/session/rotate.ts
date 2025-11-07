import type { NextApiRequest, NextApiResponse } from "next";
import { rotateSession } from "../../../lib/store";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { sessionId, ttl } = req.body ?? {};
  if (!sessionId) {
    return res.status(400).json({ error: "Missing session" });
  }
  const ttlValue = [600, 3600, 86400].includes(Number(ttl)) ? Number(ttl) : 3600;
  const result = rotateSession(sessionId, ttlValue);
  return res.status(200).json(result);
}
