import { REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const commands = [];
const commandsPath = path.join(process.cwd(), 'src', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = (await import(`file://${filePath}`)).default;
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  try {
    console.log(`🚀 Deploying ${commands.length} commands for Auralyn music bot...`);

    if (guildId) {
      // Unregister all guild commands first
      console.log('🗑️ Unregistering existing guild commands...');
      try {
        await rest.put(
          Routes.applicationGuildCommands(clientId, guildId),
          { body: [] }
        );
        console.log('✅ Existing guild commands cleared');
      } catch (e) {
        console.log('No existing guild commands to clear');
      }

      // Register new guild commands
      console.log('📝 Registering new guild commands...');
      const data = await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      console.log(`✅ Deployed ${data.length} guild commands`);
    } else {
      // Unregister all global commands first
      console.log('🗑️ Unregistering existing global commands...');
      try {
        await rest.put(
          Routes.applicationCommands(clientId),
          { body: [] }
        );
        console.log('✅ Existing global commands cleared');
      } catch (e) {
        console.log('No existing global commands to clear');
      }

      // Register new global commands
      console.log('📝 Registering new global commands...');
      const data = await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      console.log(`✅ Deployed ${data.length} global commands`);
    }

    console.log('🎉 Auralyn commands deployed successfully!');
  } catch (error) {
    console.error('❌ Error deploying commands:', error);
  }
})();