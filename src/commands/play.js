import { SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, buildNowPlayingV2, buildPlayCommandReply, buildPlaylistEmbed } from '../utils/music-ui.js';
import { resolveTrack } from '../utils/tracks.js';
import { defaultGuildSettings } from '../utils/guild-settings.js';

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song or playlist, or add it to the queue')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Song or playlist (YouTube/Spotify URL, or search terms)')
        .setRequired(true)),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    const query = interaction.options.getString('query');
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel before using `/play`.', false));
    }

    const botVoiceChannelId = interaction.guild.members.me?.voice.channelId;
    if (botVoiceChannelId && botVoiceChannelId !== voiceChannel.id) {
      return interaction.editReply(buildActionFeedback('Voice Session Locked', 'Auralyn is already connected to a different voice channel.', false));
    }

    try {
      const settings = await client.musicPlayer.getGuildSettings(interaction.guildId);
      const sourcePriority = settings?.sourcePriority ?? defaultGuildSettings.sourcePriority;

      const { track, playlist } = await resolveTrack(shoukaku, query, { sourcePriority });

      if (playlist) {
        const tracks = (playlist.tracks ?? []).map(t => ({
          ...t,
          requestedByUserId: interaction.user.id,
          requestedByName: interaction.user.username,
        }));

        if (tracks.length === 0) {
          return interaction.editReply(buildActionFeedback('Empty Playlist', 'That playlist has no playable tracks.', false));
        }

        const wasIdle = !client.musicPlayer.getPlayerState(interaction.guildId).isPlaying;
        await client.musicPlayer.enqueuePlaylist({
          guildId: interaction.guildId,
          tracks,
          textChannel: interaction.channel,
          voiceChannel,
        });

        return interaction.editReply(buildPlaylistEmbed({
          name: playlist.info?.name ?? 'Playlist',
          trackCount: tracks.length,
          firstTrack: tracks[0],
          wasIdle,
          requestedBy: interaction.user.username,
        }));
      }

      if (!track) {
        return interaction.editReply(buildActionFeedback('No Results', 'Auralyn could not find a playable result for that search.', false));
      }

      const wasIdle = !client.musicPlayer.getPlayerState(interaction.guildId).isPlaying;
      await client.musicPlayer.enqueue({
        guildId: interaction.guildId,
        track,
        textChannel: interaction.channel,
        voiceChannel,
      });

      if (wasIdle) {
        const msg = await interaction.editReply(buildNowPlayingV2(client, interaction.guildId));
        client.musicPlayer.startNowPlayingRefresh(interaction.guildId, msg);
        return msg;
      }
      return interaction.editReply(
        buildPlayCommandReply({
          interaction,
          client,
          guildId: interaction.guildId,
          addedTrack: track,
          startedPlayback: false,
        }),
      );
    } catch (error) {
      client.logger.error('Error in play command', error);
      return interaction.editReply(buildActionFeedback('Playback Failed', 'There was an error while trying to play that song.', false));
    }
  },
};
