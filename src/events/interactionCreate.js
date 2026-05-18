import { Events } from 'discord.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction, client, shoukaku) {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.error(`No command matching ${interaction.commandName}`);
      return;
    }

    try {
      console.log(`Handling /${interaction.commandName} from guild ${interaction.guildId ?? 'dm'} by ${interaction.user?.tag ?? interaction.user?.id ?? 'unknown'}`);
      await command.execute(interaction, client, shoukaku);
      console.log(`Completed /${interaction.commandName}`);
    } catch (error) {
      console.error(`Error executing /${interaction.commandName}:`, error);
      const reply = {
        content: 'There was an error executing this command!',
        ephemeral: true
      };

      try {
        if (interaction.deferred) {
          await interaction.editReply({ content: reply.content, embeds: [], components: [] });
        } else if (interaction.replied) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      } catch (replyError) {
        console.error(`Failed to send error response for /${interaction.commandName}:`, replyError);
      }
    }
  },
};
