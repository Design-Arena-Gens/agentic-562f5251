import type { NextApiRequest, NextApiResponse } from "next";
import { listMessages, pushMessage } from "../../lib/store";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      return res.status(400).json({ error: "Missing session" });
    }
    const messages = listMessages(sessionId);
    return res.status(200).json({ messages });
  }

  if (req.method === "POST") {
    const { sessionId } = req.body ?? {};
    if (!sessionId) {
      return res.status(400).json({ error: "Missing session" });
    }
    const message = pushMessage(sessionId);
    return res.status(message ? 201 : 404).json(message ? { message } : { error: "Session not found" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
