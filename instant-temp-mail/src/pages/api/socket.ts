import type { NextApiRequest } from "next";
import type { NextApiResponseServerIO } from "../../../types/next";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: NextApiRequest, res: NextApiResponseServerIO) {
  if (!res.socket.server.io) {
    const { Server } = require("socket.io");
    const io = new Server(res.socket.server, {
      path: "/api/socket",
      cors: {
        origin: "*",
      },
    });
    res.socket.server.io = io;
    global.__io = io;

    io.on("connection", (socket: import("socket.io").Socket) => {
      socket.on("join", (sessionId: string) => {
        socket.join(sessionId);
      });

      socket.on("leave", (sessionId: string) => {
        socket.leave(sessionId);
      });

      socket.on("ping", () => {
        socket.emit("pong", Date.now());
      });
    });
  }

  res.end();
}
