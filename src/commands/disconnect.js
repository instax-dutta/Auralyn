import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('disconnect')
    .setDescription('Disconnect from the voice channel')
    .addBooleanOption(option =>
      option.setName('keep_queue')
        .setDescription('Keep the queue for when the bot rejoins (default: false)')
        .setRequired(false)),

  async execute(interaction, client) {
    await interaction.deferReply();

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel first.', false));
    }

    const state = client.musicPlayer.getPlayerState(interaction.guildId);
    if (!state.isPlaying && !client.musicPlayer.queueManager.getLavalinkPlayer(interaction.guildId)) {
      return interaction.editReply(buildActionFeedback('Not Connected', 'Auralyn is not in a voice channel.', false));
    }

    const keepQueue = interaction.options.getBoolean('keep_queue') ?? false;

    try {
      if (keepQueue) {
        await client.musicPlayer.leaveVoiceOnly(interaction.guildId);
        return interaction.editReply(buildActionFeedback('Disconnected', 'Left the voice channel. Queue preserved — use `/play` to resume.'));
      } else {
        await client.musicPlayer.stop(interaction.guildId);
        return interaction.editReply(buildActionFeedback('Disconnected', 'Left the voice channel and cleared the queue.'));
      }
    } catch (error) {
      client.logger.error('Error in disconnect command', error);
      return interaction.editReply(buildActionFeedback('Disconnect Failed', 'Something went wrong while disconnecting.', false));
    }
  },
};
