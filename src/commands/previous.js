import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('previous')
    .setDescription('Play the previous track')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction, client) {
    await interaction.deferReply();

    if (!interaction.member.voice.channel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel before going back to the previous track.', false));
    }

    try {
      const prevTrack = await client.musicPlayer.previous(interaction.guildId);
      if (!prevTrack) {
        return interaction.editReply(buildActionFeedback('No History', 'There is no previous track in the history.', false));
      }

      return replyWithPlayerSnapshot(interaction, client, interaction.guildId, 'Auralyn | Now Playing');
    } catch (error) {
      client.logger.error('Error in previous command', error);
      return interaction.editReply(buildActionFeedback('Previous Failed', 'There was an error while trying to go back.', false));
    }
  },
};
