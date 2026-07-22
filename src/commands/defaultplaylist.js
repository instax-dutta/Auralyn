import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('defaultplaylist')
    .setDescription('Set the default playlist for 24/7 mode')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Playlist name (leave empty to clear)')
        .setRequired(false)),

  async execute(interaction, client) {
    await interaction.deferReply();
    try {
      const name = interaction.options.getString('name');

      if (!name) {
        await client.musicPlayer.settingsStore.update(interaction.guildId, { defaultPlaylist: null });
        return interaction.editReply(buildActionFeedback('Default Playlist', 'Default playlist cleared.'));
      }

      // Validate playlist exists (use the command author's playlists)
      const playlist = await client.playlistStore.getPlaylist(interaction.user.id, name);
      if (!playlist) {
        return interaction.editReply(buildActionFeedback('Playlist Not Found', `You don't have a playlist named "${name}".`, false));
      }

      await client.musicPlayer.settingsStore.update(interaction.guildId, { defaultPlaylist: name });
      return interaction.editReply(buildActionFeedback('Default Playlist', `Set default playlist to **${name}** (${playlist.tracks.length} tracks).`));
    } catch (error) {
      client.logger.error('Error in /defaultplaylist', error);
      return interaction.editReply(buildActionFeedback('Failed', 'Something went wrong.', false));
    }
  },
};
