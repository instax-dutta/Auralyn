import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';
import { resolveTrack } from '../utils/tracks.js';
import { defaultGuildSettings } from '../utils/guild-settings.js';

export default {
  data: new SlashCommandBuilder()
    .setName('playskip')
    .setDescription('Play a track immediately, skipping the current one')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Song URL or search terms')
        .setRequired(true)),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel before using `/playskip`.', false));
    }

    const botVoiceChannelId = interaction.guild.members.me?.voice?.channelId;
    if (botVoiceChannelId && botVoiceChannelId !== voiceChannel.id) {
      return interaction.editReply(buildActionFeedback('Voice Session Locked', 'Auralyn is already connected to a different voice channel.', false));
    }

    const query = interaction.options.getString('query');

    try {
      const settings = await client.musicPlayer.getGuildSettings(interaction.guildId);
      const sourcePriority = settings?.sourcePriority ?? defaultGuildSettings.sourcePriority;
      const { track } = await resolveTrack(shoukaku, query, { sourcePriority });

      if (!track) {
        return interaction.editReply(buildActionFeedback('No Results', 'Could not find a playable result for that search.', false));
      }

      const taggedTrack = {
        ...track,
        requestedByUserId: interaction.user.id,
        requestedByName: interaction.user.username,
      };

      client.musicPlayer.queueManager.setVoiceChannel(interaction.guildId, voiceChannel);
      client.musicPlayer.queueManager.setTextChannel(interaction.guildId, interaction.channel);
      client.musicPlayer.enqueueFront(interaction.guildId, taggedTrack);
      await client.musicPlayer.skip(interaction.guildId);

      return replyWithPlayerSnapshot(interaction, client, interaction.guildId, `Auralyn | Playing Now — ${track.info?.title ?? 'Unknown'}`);
    } catch (error) {
      client.logger.error('Error in playskip command', error);
      return interaction.editReply(buildActionFeedback('Playskip Failed', 'Something went wrong while resolving that track.', false));
    }
  },
};
