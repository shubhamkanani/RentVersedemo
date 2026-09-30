import { createApp } from './app.js';
import { config } from './config/index.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`\n  RentVerse login server`);
  console.log(`  http://localhost:${config.port}/api/v1/auth`);
  console.log(`  env=${config.env}  domain=${config.siwe.domain}  chainId=${config.siwe.chainId}`);
  console.log(`  allowed origins: ${config.corsOrigin.join(', ')}\n`);
});

/**
 * Graceful shutdown.
 *
 * Without it, a restart severs in-flight requests. Stop accepting connections,
 * let open ones drain, then exit — with a hard deadline so one stuck socket
 * cannot block the restart forever.
 */
function shutdown(signal) {
  console.log(`\n${signal} received — shutting down`);

  const force = setTimeout(() => {
    console.error('Graceful shutdown timed out after 10s — forcing exit');
    process.exit(1);
  }, 10_000);
  force.unref();

  server.close((err) => {
    if (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
    console.log('Closed cleanly');
    process.exit(0);
  });
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => shutdown(signal));
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  shutdown('unhandledRejection');
});
