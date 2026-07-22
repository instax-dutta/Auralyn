import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('showliked')
    .setDescription('View your liked songs (alias for /liked)'),

  async execute(interaction, client) {
    const likedCommand = client.commands.get('liked');
    if (!likedCommand) {
      return interaction.reply({ content: 'Liked command not found.', ephemeral: true });
    }
    return likedCommand.execute(interaction, client);
  },
};
