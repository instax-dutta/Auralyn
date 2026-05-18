import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Toggle loop mode for the queue')
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Loop mode to set')
        .setRequired(true)
        .addChoices(
          { name: 'Off', value: 'off' },
          { name: 'Track', value: 'track' },
          { name: 'Queue', value: 'queue' }
        )),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    if (!interaction.member.voice.channel) {
      return interaction.editReply({
        embeds: [buildActionFeedback('Voice Required', 'Join a voice channel before changing loop mode.', false)],
        components: [],
      });
    }

    const mode = interaction.options.getString('mode');
    let loopMode;
    switch (mode) {
      case 'off':
        loopMode = 0;
        break;
      case 'track':
        loopMode = 1;
        break;
      case 'queue':
        loopMode = 2;
        break;
      default:
        return interaction.editReply({
          embeds: [buildActionFeedback('Loop Mode', 'That loop mode is not valid.', false)],
          components: [],
        });
    }

    try {
      client.musicPlayer.setLoopMode(interaction.guildId, loopMode);
      return replyWithPlayerSnapshot(interaction, client, interaction.guildId, 'Auralyn | Loop Updated');
    } catch (error) {
      client.logger.error('Error in loop command', error);
      return interaction.editReply({
        embeds: [buildActionFeedback('Loop Update Failed', 'There was an error while trying to set the loop mode.', false)],
        components: [],
      });
    }
  },
};
