import { app } from "./app.js";
import { createServer } from "http";
import { initSocket } from "./lib/socket.js";

const port = Number(process.env.PORT || 4000);
const server = createServer(app);
initSocket(server);

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${port}`);
});
