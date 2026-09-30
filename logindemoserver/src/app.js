import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/error.js';
import { config } from './config/index.js';

/**
 * App wiring only — no route logic, no listen().
 *
 * Keeping this separate from server.js means tests can import the app and drive
 * it with supertest without binding a port.
 */
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());

  app.use(
    cors({
      origin: config.corsOrigin,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86_400,
    })
  );

  // Every endpoint takes an address, a nonce or a signature. Nothing legitimate
  // is large, so a tight cap is free protection.
  app.use(express.json({ limit: '16kb' }));

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    })
  );

  app.use('/api/v1', routes);

  // Order matters: notFound after all routes, errorHandler last.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
