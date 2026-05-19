import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('skipto')
    .setDescription('Skip to a specific position in the queue')
    .addIntegerOption(option =>
      option.setName('position')
        .setDescription('Queue position to skip to')
        .setRequired(true)
        .setMinValue(1)),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    if (!interaction.member.voice.channel) {
      return interaction.editReply({
        embeds: [buildActionFeedback('Voice Required', 'Join a voice channel before skipping positions.', false)],
        components: [],
      });
    }

    try {
      const position = interaction.options.getInteger('position');
      const queue = client.musicPlayer.getQueue(interaction.guildId);

      if (position > queue.length) {
        return interaction.editReply({
          embeds: [buildActionFeedback('Invalid Position', `The queue only has ${queue.length} track(s). Position ${position} is out of range.`, false)],
          components: [],
        });
      }

      client.musicPlayer.getQueueManager().removeBefore(interaction.guildId, position);
      const nextTrack = await client.musicPlayer.skip(interaction.guildId);

      if (!nextTrack) {
        return interaction.editReply({
          embeds: [buildActionFeedback('Skip To', 'Skipped to the target position but nothing is playing.', false)],
          components: [],
        });
      }

      return replyWithPlayerSnapshot(interaction, client, interaction.guildId, 'Auralyn | Queued Position');
    } catch (error) {
      client.logger.error('Error in skipto command', error);
      return interaction.editReply({
        embeds: [buildActionFeedback('Skip To Failed', 'There was an error while skipping to that position.', false)],
        components: [],
      });
    }
  },
};
