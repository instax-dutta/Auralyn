import { deployCommands } from './utils/deploy-commands.js';
import { pathToFileURL } from 'url';
import { createLogger } from './utils/logger.js';

export { deployCommands };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  deployCommands().catch(error => {
    const logger = createLogger({ level: process.env.LOG_LEVEL ?? 'info', scope: 'deploy' });
    logger.error('Failed to deploy commands', error);
    process.exit(1);
  });
}
