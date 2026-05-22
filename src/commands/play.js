import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { buildActionFeedback, buildPlayCommandReply } from '../utils/music-ui.js';
import { resolveTrack, isSpotifyUrl } from '../utils/tracks.js';
import { defaultGuildSettings } from '../utils/guild-settings.js';
import { infoEmbed } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song or add it to the queue')
    .setContexts(InteractionContextType.Guild)
    .addStringOption(option =>
      option.setName('query')
        .setDescription('The song to play (YouTube URL or search terms)')
        .setRequired(true)),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    const query = interaction.options.getString('query');
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.editReply({
        embeds: [buildActionFeedback('Voice Required', 'Join a voice channel before using `/play`.', false)],
        components: [],
      });
    }

    const botVoiceChannelId = interaction.guild.members.me?.voice.channelId;
    if (botVoiceChannelId && botVoiceChannelId !== voiceChannel.id) {
      return interaction.editReply({
        embeds: [buildActionFeedback('Voice Session Locked', 'Auralyn is already connected to a different voice channel.', false)],
        components: [],
      });
    }

    if (isSpotifyUrl(query)) {
      return interaction.editReply({
        embeds: [infoEmbed(
          "Spotify links aren't supported on Auralyn yet. Paste a YouTube link instead, or just type the song name and Auralyn will find it.",
          'Auralyn | Spotify Unsupported',
        )],
        components: [],
      });
    }

    try {
      const settings = await client.musicPlayer.getGuildSettings(interaction.guildId);
      const sourcePriority = settings?.sourcePriority ?? defaultGuildSettings.sourcePriority;

      const { track, playlist } = await resolveTrack(shoukaku, query, { sourcePriority });

      if (playlist) {
        const tracks = playlist.tracks ?? [];
        if (tracks.length === 0) {
          return interaction.editReply({
            embeds: [buildActionFeedback('Empty Playlist', 'This playlist does not have any playable tracks.', false)],
            components: [],
          });
        }

        let enqueued = 0;
        for (const t of tracks) {
          try {
            await client.musicPlayer.enqueue({
              guildId: interaction.guildId,
              track: t,
              textChannel: interaction.channel,
              voiceChannel,
            });
            enqueued++;
          } catch (enqueueError) {
            client.logger.error(`Failed to enqueue track from playlist: ${t?.info?.title}`, enqueueError);
          }
        }

        if (enqueued === 0) {
          return interaction.editReply({
            embeds: [buildActionFeedback('Playlist Failed', 'Could not enqueue any tracks from this playlist.', false)],
            components: [],
          });
        }

        return interaction.editReply({
          embeds: [buildActionFeedback(
            'Playlist Added',
            `Enqueued **${enqueued} track${enqueued === 1 ? '' : 's'}** from **${playlist.info?.name ?? 'playlist'}**.`,
          )],
          components: [],
        });
      }

      if (!track) {
        return interaction.editReply({
          embeds: [buildActionFeedback('No Results', 'Auralyn could not find a playable result for that search.', false)],
          components: [],
        });
      }

      const wasIdle = !client.musicPlayer.getPlayerState(interaction.guildId).isPlaying;
      await client.musicPlayer.enqueue({
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
      client.logger.error('Error in play command', error);

      const message = error.message?.includes('No connected Lavalink node')
        ? 'The music server is not connected. Please try again in a moment.'
        : error.message?.includes('Unsupported Lavalink load type')
          ? 'This type of content is not supported right now.'
          : 'There was an error while trying to play that.';

      return interaction.editReply({
        embeds: [buildActionFeedback('Playback Failed', message, false)],
        components: [],
      });
    }
  },
};
