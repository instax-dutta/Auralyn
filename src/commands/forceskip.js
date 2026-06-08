import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';
import { requireDjOrAdmin } from '../utils/permissions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('forceskip')
    .setDescription('Force-skip the current track (DJ only)'),

  async execute(interaction, client) {
    await interaction.deferReply();

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel first.', false));
    }

    const state = client.musicPlayer.getPlayerState(interaction.guildId);
    if (!state.isPlaying) {
      return interaction.editReply(buildActionFeedback('Nothing Playing', 'There is nothing playing to skip.', false));
    }

    const settings = await client.musicPlayer.getGuildSettings(interaction.guildId);
    const djCheck = requireDjOrAdmin(interaction, settings);
    if (!djCheck.allowed) return interaction.editReply(djCheck.reply);

    try {
      const nextTrack = await client.musicPlayer.skip(interaction.guildId);
      if (!nextTrack) {
        return interaction.editReply(buildActionFeedback('Force Skipped', 'Track skipped. The queue is now empty.'));
      }
      return replyWithPlayerSnapshot(interaction, client, interaction.guildId, 'Auralyn | Force Skipped');
    } catch (error) {
      client.logger.error('Error in forceskip command', error);
      return interaction.editReply(buildActionFeedback('Force Skip Failed', 'Something went wrong.', false));
    }
  },
};
