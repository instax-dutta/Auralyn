import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, buildQueueReply } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Shuffle the queue'),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    if (!interaction.member.voice.channel) {
      return interaction.editReply({
        embeds: [buildActionFeedback('Voice Required', 'Join a voice channel before shuffling the queue.', false)],
        components: [],
      });
    }

    try {
      client.musicPlayer.shuffle(interaction.guildId);
      return interaction.editReply(buildQueueReply(client, interaction.guildId));
    } catch (error) {
      client.logger.error('Error in shuffle command', error);
      return interaction.editReply({
        embeds: [buildActionFeedback('Shuffle Failed', 'There was an error while trying to shuffle the queue.', false)],
        components: [],
      });
    }
  },
};
