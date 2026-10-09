import dotenv from 'dotenv';
import { createApp } from './app.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const app = createApp();

const server = app.listen(PORT, HOST, () => {
  console.log(`[CampusEats] Backend server listening on http://${HOST}:${PORT}`);
  console.log(`[CampusEats] Architecture: Modular Monolith | Current: Phase 0 Foundation`);
  console.log(`[CampusEats] Frontend State: FROZEN (Strictly no UI until Phase 14 complete)`);
  console.log(`[CampusEats] Healthcheck: http://${HOST}:${PORT}/health`);
});

// Graceful Shutdown
function handleShutdown(signal: string) {
  console.log(`\n[CampusEats] Received ${signal}. Initiating graceful shutdown...`);
  server.close(() => {
    console.log('[CampusEats] HTTP server closed cleanly. Exiting process.');
    process.exit(0);
  });

  // Force shutdown after 10s if dangling connections persist
  setTimeout(() => {
    console.error('[CampusEats] Forcing shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
