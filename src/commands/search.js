import {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  ComponentType,
} from 'discord.js';
import { LoadType } from 'shoukaku';
import { buildActionFeedback, buildNowPlayingV2, buildPlayCommandReply } from '../utils/music-ui.js';
import { formatDuration } from '../utils/tracks.js';
import { AuralynColors } from '../utils/embeds.js';

const RESULT_LIMIT = 5;
const SELECTION_TIMEOUT_MS = 30_000;

function buildSearchV2(query, tracks) {
  const body = tracks
    .map((track, i) => {
      const title = track.info.title ?? 'Unknown';
      const author = track.info.author ?? 'Unknown';
      const duration = track.info.isStream ? '🔴 Live' : formatDuration(track.info.length);
      const uri = track.info.uri;
      const linked = uri ? `[${title}](${uri})` : title;
      return `\`${i + 1}.\` ${linked}\n-# ${author} · ${duration}`;
    })
    .join('\n\n');

  const select = new StringSelectMenuBuilder()
    .setCustomId('auralyn:search-pick')
    .setPlaceholder('Choose a track...')
    .addOptions(tracks.map((track, i) => ({
      label: (track.info.title ?? 'Unknown').slice(0, 100),
      description: `${(track.info.author ?? 'Unknown').slice(0, 50)} · ${track.info.isStream ? 'Live' : formatDuration(track.info.length)}`,
      value: String(i),
    })));

  const container = new ContainerBuilder()
    .setAccentColor(AuralynColors.primary)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Auralyn | Search Results'))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${query}**`))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Select a track below — expires in 30s.'))
    .addActionRowComponents(new ActionRowBuilder().addComponents(select));

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

export default {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search for a song and pick from the top results')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Song name or search terms')
        .setRequired(true)),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    const query = interaction.options.getString('query');
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel before searching.', false));
    }

    const botVoiceChannelId = interaction.guild.members.me?.voice.channelId;
    if (botVoiceChannelId && botVoiceChannelId !== voiceChannel.id) {
      return interaction.editReply(buildActionFeedback('Voice Session Locked', 'Auralyn is already in a different voice channel.', false));
    }

    const node = shoukaku.getIdealNode();
    if (!node) {
      return interaction.editReply(buildActionFeedback('Unavailable', 'No audio server is available right now.', false));
    }

    let tracks;
    try {
      const result = await node.rest.resolve(`ytsearch:${query}`);
      if (!result || result.loadType !== LoadType.SEARCH || !result.data?.length) {
        return interaction.editReply(buildActionFeedback('No Results', `No results found for **${query}**.`, false));
      }
      tracks = result.data.slice(0, RESULT_LIMIT);
    } catch (error) {
      client.logger.error('Search resolve error', error);
      return interaction.editReply(buildActionFeedback('Search Failed', 'Failed to fetch results from the audio server.', false));
    }

    await interaction.editReply(buildSearchV2(query, tracks));

    const msg = await interaction.fetchReply();

    let picked;
    try {
      const selection = await msg.awaitMessageComponent({
        filter: i => i.user.id === interaction.user.id,
        componentType: ComponentType.StringSelect,
        time: SELECTION_TIMEOUT_MS,
      });
      await selection.deferUpdate();
      picked = tracks[parseInt(selection.values[0], 10)];
    } catch {
      return interaction.editReply(buildActionFeedback('Search Expired', 'No track was selected in time.', false));
    }

    if (!picked) {
      return interaction.editReply(buildActionFeedback('Search Error', 'Could not resolve the selected track.', false));
    }

    picked._sourceInfo = { source: 'YouTube', sourceName: 'youtube' };

    try {
      const wasIdle = !client.musicPlayer.getPlayerState(interaction.guildId).isPlaying;
      await client.musicPlayer.enqueue({
        guildId: interaction.guildId,
        track: picked,
        textChannel: interaction.channel,
        voiceChannel,
      });

      if (wasIdle) {
        const reply = await interaction.editReply(buildNowPlayingV2(client, interaction.guildId));
        client.musicPlayer.startNowPlayingRefresh(interaction.guildId, reply);
        return reply;
      }
      return interaction.editReply(
        buildPlayCommandReply({
          interaction,
          client,
          guildId: interaction.guildId,
          addedTrack: picked,
          startedPlayback: false,
        }),
      );
    } catch (error) {
      client.logger.error('Error queuing search result', error);
      return interaction.editReply(buildActionFeedback('Playback Failed', 'There was an error while trying to play that track.', false));
    }
  },
};
