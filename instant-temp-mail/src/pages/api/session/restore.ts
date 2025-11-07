import type { NextApiRequest, NextApiResponse } from "next";
import { restoreSession } from "../../../lib/store";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { snapshot } = req.body ?? {};
  if (!snapshot?.id) {
    return res.status(400).json({ error: "Invalid snapshot" });
  }

  const restored = restoreSession(snapshot);
  return res.status(200).json({ session: restored });
}
