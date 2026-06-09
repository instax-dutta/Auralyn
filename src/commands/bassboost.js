import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';

const LEVEL_MAP = {
  low:    'bass_low',
  medium: 'bass',
  high:   'bass_high',
  off:    'flat',
};

export default {
  data: new SlashCommandBuilder()
    .setName('bassboost')
    .setDescription('Apply bass boost at a chosen intensity level')
    .addStringOption(option =>
      option.setName('level')
        .setDescription('Bass boost intensity (default: medium)')
        .setRequired(false)
        .addChoices(
          { name: '🔉 Low',    value: 'low'    },
          { name: '🔊 Medium', value: 'medium' },
          { name: '📢 High',   value: 'high'   },
          { name: '⏸️ Off',   value: 'off'    },
        )),

  async execute(interaction, client) {
    await interaction.deferReply();

    if (!interaction.member.voice.channel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel before changing the filter.', false));
    }

    const state = client.musicPlayer.getPlayerState(interaction.guildId);
    if (!state.isPlaying) {
      return interaction.editReply(buildActionFeedback('Nothing Playing', 'Start playing something before applying a filter.', false));
    }

    const level = interaction.options.getString('level') ?? 'medium';
    const preset = LEVEL_MAP[level];

    try {
      const result = await client.musicPlayer.setFilter(interaction.guildId, preset);
      if (!result.ok) return interaction.editReply(buildActionFeedback('Filter Conflict', result.reason, false));
      const label = level === 'off' ? '⏸️ Flat (no EQ)' : `🔊 Bass Boost — ${level.charAt(0).toUpperCase() + level.slice(1)}`;
      return replyWithPlayerSnapshot(interaction, client, interaction.guildId, `Auralyn | ${label}`);
    } catch (error) {
      client.logger.error('Error in bassboost command', error);
      return interaction.editReply(buildActionFeedback('Filter Failed', 'There was an error applying that bass boost level.', false));
    }
  },
};
