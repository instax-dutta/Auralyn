import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('playlists')
    .setDescription('View all your playlists (alias for /playlist list)'),

  async execute(interaction, client) {
    const playlistCommand = client.commands.get('playlist');
    if (!playlistCommand) {
      return interaction.reply({ content: 'Playlist command not found.', ephemeral: true });
    }
    // Simulate /playlist list by setting the subcommand context
    interaction.options.getSubcommand = () => 'list';
    return playlistCommand.execute(interaction, client);
  },
};
