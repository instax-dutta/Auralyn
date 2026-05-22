import { SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { buildActionFeedback, buildPlayCommandReply } from '../utils/music-ui.js';
import { resolveTrack } from '../utils/tracks.js';
import { defaultGuildSettings } from '../utils/guild-settings.js';

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song or add it to the queue')
    .setContexts(InteractionContextType.Guild)
    .addStringOption(option =>
      option.setName('query')
        .setDescription('The song to play (YouTube URL, Spotify URL, or search terms)')
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

        const playlistName = playlist.info?.name ?? 'playlist';
        const total = tracks.length;
        const requester = {
          requestedByUserId: interaction.user.id,
          requestedByName: interaction.member?.displayName ?? interaction.user.username,
        };
        const annotated = tracks.map(t => ({ ...t, ...requester }));

        const renderProgress = (enqueued) => buildActionFeedback(
          'Adding Playlist',
          `📥 Enqueueing **${playlistName}** — ${enqueued}/${total} tracks added${enqueued < total ? '…' : '.'}`,
        );

        await interaction.editReply({
          embeds: [renderProgress(0)],
          components: [],
        });

        let lastEditAt = 0;
        const PROGRESS_EDIT_INTERVAL_MS = 1500;

        const { enqueued, aborted } = await client.musicPlayer.enqueuePlaylist({
          guildId: interaction.guildId,
          tracks: annotated,
          textChannel: interaction.channel,
          voiceChannel,
          batchSize: 50,
          batchDelayMs: 1500,
          onProgress: async ({ enqueued, total }) => {
            const now = Date.now();
            const isFinalBatch = enqueued >= total;
            if (!isFinalBatch && now - lastEditAt < PROGRESS_EDIT_INTERVAL_MS) return;
            lastEditAt = now;
            try {
              await interaction.editReply({
                embeds: [renderProgress(enqueued)],
                components: [],
              });
            } catch { /* edit failures are non-fatal */ }
          },
        });

        if (enqueued === 0) {
          return interaction.editReply({
            embeds: [buildActionFeedback('Playlist Failed', 'Could not enqueue any tracks from this playlist.', false)],
            components: [],
          });
        }

        return interaction.editReply({
          embeds: [buildActionFeedback(
            'Playlist Added',
            aborted
              ? `Added **${enqueued}/${total}** tracks from **${playlistName}** before the session was reset.`
              : `Enqueued **${enqueued} track${enqueued === 1 ? '' : 's'}** from **${playlistName}**.`,
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
