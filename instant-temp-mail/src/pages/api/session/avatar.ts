import type { NextApiRequest, NextApiResponse } from "next";
import { updateAvatar } from "../../../lib/store";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { sessionId, avatar } = req.body ?? {};
  if (!sessionId || !avatar) {
    return res.status(400).json({ error: "Missing data" });
  }

  const session = updateAvatar(sessionId, avatar);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  res.status(200).json({ session });
}
