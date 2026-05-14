import { startServer } from '../../../server/server.js';

const port = Number(process.env.PORT || 3001);

startServer(port).catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
