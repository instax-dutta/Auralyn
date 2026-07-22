import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { buildActionFeedback, buildSimpleV2 } from '../utils/music-ui.js';
import { AuralynColors } from '../utils/embeds.js';
import { formatDuration } from '../utils/tracks.js';

const PER_PAGE = 10;

export default {
  data: new SlashCommandBuilder()
    .setName('playlist')
    .setDescription('Manage your playlists')
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Create a new playlist')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true))
        .addStringOption(opt => opt.setName('cover').setDescription('Cover image URL').setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Delete a playlist')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add the current track to a playlist')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a track from a playlist')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true))
        .addIntegerOption(opt => opt.setName('position').setDescription('Track position').setMinValue(1).setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View a playlist')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true))
        .addIntegerOption(opt => opt.setName('page').setDescription('Page number').setMinValue(1).setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all your playlists'))
    .addSubcommand(sub =>
      sub.setName('play')
        .setDescription('Play a playlist')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true))
        .addBooleanOption(opt => opt.setName('shuffle').setDescription('Shuffle the playlist').setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('save')
        .setDescription('Save the current queue to a playlist')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('cover')
        .setDescription('Set a playlist cover image')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true))
        .addStringOption(opt => opt.setName('url').setDescription('Cover image URL').setRequired(true))),

  async execute(interaction, client) {
    await interaction.deferReply();
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'create') {
        const name = interaction.options.getString('name');
        const cover = interaction.options.getString('cover');
        await client.playlistStore.createPlaylist(interaction.user.id, name, cover);
        return interaction.editReply(buildActionFeedback('Playlist Created', `Playlist **${name}** created.`));
      }

      if (subcommand === 'delete') {
        const name = interaction.options.getString('name');
        await client.playlistStore.deletePlaylist(interaction.user.id, name);
        return interaction.editReply(buildActionFeedback('Playlist Deleted', `Playlist **${name}** deleted.`));
      }

      if (subcommand === 'add') {
        const name = interaction.options.getString('name');
        const state = client.musicPlayer.getPlayerState(interaction.guildId);
        if (!state.currentTrack) {
          return interaction.editReply(buildActionFeedback('Nothing Playing', 'There is nothing playing to add.', false));
        }
        await client.playlistStore.addTrackToPlaylist(interaction.user.id, name, state.currentTrack);
        return interaction.editReply(buildActionFeedback('Track Added', `Added **${state.currentTrack.info?.title}** to playlist **${name}**.`));
      }

      if (subcommand === 'remove') {
        const name = interaction.options.getString('name');
        const position = interaction.options.getInteger('position');
        await client.playlistStore.removeTrackFromPlaylist(interaction.user.id, name, position);
        return interaction.editReply(buildActionFeedback('Track Removed', `Removed track #${position} from playlist **${name}**.`));
      }

      if (subcommand === 'view') {
        const name = interaction.options.getString('name');
        const page = interaction.options.getInteger('page') ?? 1;
        const playlist = await client.playlistStore.getPlaylist(interaction.user.id, name);
        if (!playlist) {
          return interaction.editReply(buildActionFeedback('Playlist Not Found', `You don't have a playlist named "${name}".`, false));
        }

        if (playlist.tracks.length === 0) {
          return interaction.editReply(buildSimpleV2(`Auralyn | Playlist — ${name}`, 'This playlist is empty. Use `/playlist add` to add tracks.', AuralynColors.info));
        }

        const totalPages = Math.ceil(playlist.tracks.length / PER_PAGE);
        const offset = (page - 1) * PER_PAGE;
        const pageTracks = playlist.tracks.slice(offset, offset + PER_PAGE);

        const lines = pageTracks.map((t, i) => {
          const pos = offset + i + 1;
          const title = t.uri ? `[${t.title}](${t.uri})` : t.title;
          const duration = formatDuration(t.duration);
          return `\`${pos}.\` ${title}  •  \`${duration}\``;
        });

        const container = new ContainerBuilder()
          .setAccentColor(AuralynColors.accent)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Auralyn | Playlist — ${name} (Page ${page}/${totalPages})`))
          .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
          .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Total: ${playlist.tracks.length} tracks`));

        if (totalPages > 1) {
          const row = new ActionRowBuilder();
          if (page > 1) {
            row.addComponents(new ButtonBuilder().setCustomId(`auralyn:pl:page:${interaction.user.id}:${name}:${page - 1}`).setLabel('Previous').setStyle(ButtonStyle.Secondary));
          }
          if (page < totalPages) {
            row.addComponents(new ButtonBuilder().setCustomId(`auralyn:pl:page:${interaction.user.id}:${name}:${page + 1}`).setLabel('Next').setStyle(ButtonStyle.Secondary));
          }
          container.addActionRowComponents(row);
        }

        return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }

      if (subcommand === 'list') {
        const playlists = await client.playlistStore.getPlaylists(interaction.user.id);
        if (playlists.length === 0) {
          return interaction.editReply(buildSimpleV2('Auralyn | Your Playlists', 'You have no playlists. Use `/playlist create` to make one.', AuralynColors.info));
        }

        const lines = playlists.map((pl) => `**${pl.name}**  •  ${pl.tracks.length} track${pl.tracks.length === 1 ? '' : 's'}`);
        return interaction.editReply(buildSimpleV2('Auralyn | Your Playlists', lines.join('\n'), AuralynColors.info));
      }

      if (subcommand === 'play') {
        const name = interaction.options.getString('name');
        const shuffle = interaction.options.getBoolean('shuffle') ?? false;
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
          return interaction.editReply(buildActionFeedback('Voice Required', 'Join a voice channel first.', false));
        }

        const playlist = await client.playlistStore.getPlaylist(interaction.user.id, name);
        if (!playlist) {
          return interaction.editReply(buildActionFeedback('Playlist Not Found', `You don't have a playlist named "${name}".`, false));
        }
        if (playlist.tracks.length === 0) {
          return interaction.editReply(buildActionFeedback('Empty Playlist', `Playlist **${name}** is empty.`, false));
        }

        let tracks = playlist.tracks.map((t) => ({
          encoded: t.encoded,
          info: { title: t.title, uri: t.uri, length: t.duration },
          requestedByUserId: interaction.user.id,
          requestedByName: interaction.user.username,
        }));

        if (shuffle) {
          for (let i = tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
          }
        }

        await client.musicPlayer.enqueuePlaylist({
          guildId: interaction.guildId,
          tracks,
          textChannel: interaction.channel,
          voiceChannel,
        });

        return interaction.editReply(buildActionFeedback('Playlist', `Queued **${tracks.length}** track${tracks.length === 1 ? '' : 's'} from playlist **${name}**${shuffle ? ' (shuffled)' : ''}.`));
      }

      if (subcommand === 'save') {
        const name = interaction.options.getString('name');
        const state = client.musicPlayer.getPlayerState(interaction.guildId);
        const allTracks = [state.currentTrack, ...state.queue].filter(Boolean);
        if (allTracks.length === 0) {
          return interaction.editReply(buildActionFeedback('Nothing Playing', 'There is nothing playing or queued to save.', false));
        }

        await client.playlistStore.saveQueueToPlaylist(interaction.user.id, name, allTracks);
        return interaction.editReply(buildActionFeedback('Queue Saved', `Added **${allTracks.length}** track${allTracks.length === 1 ? '' : 's'} to playlist **${name}**.`));
      }

      if (subcommand === 'cover') {
        const name = interaction.options.getString('name');
        const url = interaction.options.getString('url');
        await client.playlistStore.setPlaylistCover(interaction.user.id, name, url);
        return interaction.editReply(buildActionFeedback('Cover Set', `Updated cover for playlist **${name}**.`));
      }

    } catch (error) {
      client.logger.error(`Error in /playlist ${subcommand}`, error);
      return interaction.editReply(buildActionFeedback('Failed', error.message || 'Something went wrong.', false));
    }
  },
};
