import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, buildPlayCommandReply } from '../utils/music-ui.js';
import { resolveTrack } from '../utils/tracks.js';
import { defaultGuildSettings } from '../utils/guild-settings.js';

export default {
  data: new SlashCommandBuilder()
    .setName('playnext')
    .setDescription('Add a song to the front of the queue')
    .setContexts(InteractionContextType.Guild)
    .addStringOption(option =>
      option.setName('query')
        .setDescription('The song to play next (URL or search terms)')
        .setRequired(true)),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    const query = interaction.options.getString('query');
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel before using `/playnext`.', false));
    }

    const botVoiceChannelId = interaction.guild.members.me?.voice.channelId;
    if (botVoiceChannelId && botVoiceChannelId !== voiceChannel.id) {
      return interaction.editReply(buildActionFeedback('Voice Session Locked', 'Auralyn is already connected to a different voice channel.', false));
    }

    try {
      const settings = await client.musicPlayer.getGuildSettings(interaction.guildId);
      const sourcePriority = settings?.sourcePriority ?? defaultGuildSettings.sourcePriority;

      const { track } = await resolveTrack(shoukaku, query, { sourcePriority });
      if (!track) {
        return interaction.editReply(buildActionFeedback('No Results', 'Auralyn could not find a playable result for that search.', false));
      }

      const wasIdle = !client.musicPlayer.getPlayerState(interaction.guildId).isPlaying;
      await client.musicPlayer.enqueueFront({
        guildId: interaction.guildId,
        track,
        textChannel: interaction.channel,
        voiceChannel,
      });

      return interaction.editReply(
        buildPlayCommandReply({
          interaction,
          client,
          guildId: interaction.guildId,
          addedTrack: track,
          startedPlayback: wasIdle,
        }),
      );
    } catch (error) {
      client.logger.error('Error in playnext command', error);
      return interaction.editReply(buildActionFeedback('Playback Failed', 'There was an error while trying to play that song.', false));
    }
  },
};
