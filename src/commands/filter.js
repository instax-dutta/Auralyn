import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';
import { FILTER_LABELS } from '../utils/audio-filters.js';

export default {
  data: new SlashCommandBuilder()
    .setName('filter')
    .setDescription('Set the audio equalizer preset')
    .addStringOption(option =>
      option.setName('preset')
        .setDescription('The EQ preset to apply')
        .setRequired(true)
        .addChoices(
          { name: 'Flat — no EQ (default)', value: 'flat'      },
          { name: 'Balanced',               value: 'balanced'  },
          { name: 'Bass Boost',             value: 'bass'      },
          { name: 'Treble Boost',           value: 'treble'    },
          { name: 'Nightcore',          value: 'nightcore' },
          { name: '8D Audio',           value: '8d'        },
          { name: 'Karaoke',            value: 'karaoke'   },
          { name: 'Speed Up',           value: 'speed'     },
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

    const preset = interaction.options.getString('preset');

    try {
      await client.musicPlayer.setFilter(interaction.guildId, preset);
      return replyWithPlayerSnapshot(interaction, client, interaction.guildId, `Auralyn | Filter — ${FILTER_LABELS[preset]}`);
    } catch (error) {
      client.logger.error('Error in filter command', error);
      return interaction.editReply(buildActionFeedback('Filter Failed', 'There was an error applying that filter.', false));
    }
  },
};
