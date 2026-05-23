import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  ComponentType,
} from 'discord.js';
import { AuralynColors } from '../utils/embeds.js';
import { buildActionFeedback } from '../utils/music-ui.js';

const LRCLIB_BASE = 'https://lrclib.net/api';
const PAGE_SIZE = 1500;
const COLLECTOR_TIMEOUT = 3 * 60 * 1000;

async function fetchFromLrclib(artist, title) {
  const url = new URL(`${LRCLIB_BASE}/get`);
  url.searchParams.set('artist_name', artist);
  url.searchParams.set('track_name', title);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(6000) });
  if (res.ok) {
    const data = await res.json();
    if (data.plainLyrics) return data;
  }

  const searchUrl = new URL(`${LRCLIB_BASE}/search`);
  searchUrl.searchParams.set('q', `${artist} ${title}`.trim());
  const searchRes = await fetch(searchUrl.toString(), { signal: AbortSignal.timeout(6000) });
  if (!searchRes.ok) return null;

  const results = await searchRes.json();
  return Array.isArray(results) ? (results.find(r => r.plainLyrics) ?? null) : null;
}

function splitIntoPages(text) {
  const lines = text.split('\n');
  const pages = [];
  let current = '';

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > PAGE_SIZE && current) {
      pages.push(current.trim());
      current = line;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) pages.push(current.trim());
  return pages;
}

function buildLyricsV2(pages, page, trackName, artistName, disabled = false) {
  const total = pages.length;
  const container = new ContainerBuilder()
    .setAccentColor(AuralynColors.primary)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Auralyn | Lyrics'))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${trackName}** — ${artistName}`))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(pages[page]))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Page ${page + 1}/${total} • Powered by LRCLIB`));

  if (total > 1) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('auralyn:lyrics:prev')
          .setLabel('◀  Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || page === 0),
        new ButtonBuilder()
          .setCustomId('auralyn:lyrics:next')
          .setLabel('Next  ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || page === total - 1),
      ),
    );
  }

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

export default {
  data: new SlashCommandBuilder()
    .setName('lyrics')
    .setDescription('Fetch lyrics for the current track or any song')
    .addStringOption(option =>
      option.setName('song')
        .setDescription('Song to look up — "Artist - Title" or just a title (default: current track)')
        .setRequired(false)),

  async execute(interaction, client) {
    await interaction.deferReply();

    const query = interaction.options.getString('song');
    let artist = '';
    let title = '';

    if (query) {
      const dashIdx = query.indexOf(' - ');
      if (dashIdx !== -1) {
        artist = query.slice(0, dashIdx).trim();
        title = query.slice(dashIdx + 3).trim();
      } else {
        title = query.trim();
      }
    } else {
      const state = client.musicPlayer.getPlayerState(interaction.guildId);
      if (!state.isPlaying || !state.currentTrack) {
        return interaction.editReply(buildActionFeedback(
          'No Track Playing',
          'Nothing is playing right now. Use `/play` first, or pass a song name with `/lyrics song:`.',
          false,
        ));
      }
      artist = state.currentTrack.info?.author ?? '';
      title = state.currentTrack.info?.title ?? '';
    }

    let lyricsData = null;
    try {
      lyricsData = await fetchFromLrclib(artist, title);
    } catch (err) {
      client.logger?.error('Lyrics fetch failed', err);
    }

    if (!lyricsData?.plainLyrics) {
      const searchQuery = encodeURIComponent(`${artist} ${title}`.trim());
      return interaction.editReply(buildActionFeedback(
        'Lyrics Not Found',
        `No lyrics found for **${title}**${artist ? ` by **${artist}**` : ''}.\n\n[Search on Genius →](https://genius.com/search?q=${searchQuery})`,
        false,
      ));
    }

    const trackName = lyricsData.trackName ?? title;
    const artistName = lyricsData.artistName ?? artist;
    const pages = splitIntoPages(lyricsData.plainLyrics);
    let page = 0;

    await interaction.editReply(buildLyricsV2(pages, page, trackName, artistName));

    if (pages.length <= 1) return;

    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === interaction.user.id && i.customId.startsWith('auralyn:lyrics:'),
      time: COLLECTOR_TIMEOUT,
    });

    collector.on('collect', async i => {
      if (i.customId === 'auralyn:lyrics:prev') page = Math.max(0, page - 1);
      else if (i.customId === 'auralyn:lyrics:next') page = Math.min(pages.length - 1, page + 1);

      await i.update(buildLyricsV2(pages, page, trackName, artistName));
    });

    collector.on('end', async () => {
      await interaction.editReply(buildLyricsV2(pages, page, trackName, artistName, true)).catch(() => {});
    });
  },
};
