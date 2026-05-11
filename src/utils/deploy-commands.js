import { REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const commands = [];
const commandsPath = path.join(process.cwd(), 'src', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = (await import(`file://${filePath}`)).default;
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    // Put the commands
    if (process.env.GUILD_ID) {
      // Guild commands for instant update
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands },
      );
      console.log(`Successfully reloaded ${commands.length} application (/) commands for guild ${process.env.GUILD_ID}`);
    } else {
      // Global commands (can take up to an hour to propagate)
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands },
      );
      console.log(`Successfully reloaded ${commands.length} application (/) commands globally`);
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();