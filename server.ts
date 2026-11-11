import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));

  // Import API handlers
  const uploadSessionHandler = (await import('./api/upload-session.js')).default;
  const fileStatusHandler = (await import('./api/file-status.js')).default;
  const transcribeHandler = (await import('./api/transcribe.js')).default;
  const healthHandler = (await import('./api/health.js')).default;

  // Mount API endpoints
  app.post('/api/upload-session', (req, res) => uploadSessionHandler(req, res));
  app.all('/api/file-status', (req, res) => fileStatusHandler(req, res));
  app.post('/api/transcribe', (req, res) => transcribeHandler(req, res));
  app.all('/api/health', (req, res) => healthHandler(req, res));

  // In development, hook Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production preview
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Bisaya Transcriber] Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
