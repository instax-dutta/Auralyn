import { deployCommands } from './utils/deploy-commands.js';
import { pathToFileURL } from 'url';

export { deployCommands };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  deployCommands().catch(error => {
    console.error('Failed to deploy commands:', error);
    process.exit(1);
  });
}
