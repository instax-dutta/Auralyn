import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
  ComponentType,
} from 'discord.js';
import { AuralynColors } from '../utils/embeds.js';

const CATEGORIES = {
  playback: {
    label: '🎵 Music Playback',
    commands: [
      { name: '/play', description: 'Play a song or add it to the queue (URL or search term)' },
      { name: '/search', description: 'Search for a song and pick from the top 5 results' },
      { name: '/seek', description: 'Jump to a position in the current track (e.g. 1:30 or 90)' },
      { name: '/skip', description: 'Skip the current track (requires DJ role if more than 3 members in VC)' },
      { name: '/voteskip', description: 'Start a vote to skip the current track — DJ role bypasses the vote' },
      { name: '/stop', description: 'Stop the music and clear the queue' },
      { name: '/pause', description: 'Pause the current track' },
      { name: '/resume', description: 'Resume the current track' },
      { name: '/volume', description: 'Set the player volume (1–100)' },
      { name: '/nowplaying', description: 'Show the currently playing track' },
      { name: '/loop', description: 'Toggle loop mode (off / track / queue)' },
      { name: '/filter', description: 'Apply an audio preset (balanced, bass, treble, nightcore, 8D, karaoke, speed)' },
      { name: '/autoplay', description: 'Toggle autoplay — queues related tracks when the queue ends' },
      { name: '/lyrics', description: 'Fetch lyrics for the current track or any song (paginated)' },
    ],
  },
  queue: {
    label: '📋 Queue Management',
    commands: [
      { name: '/queue', description: 'View the current music queue' },
      { name: '/shuffle', description: 'Shuffle the queue' },
      { name: '/remove', description: 'Remove a track from the queue by position' },
      { name: '/move', description: 'Move a track to a different position in the queue' },
      { name: '/clear', description: 'Clear all upcoming tracks without stopping the current one' },
      { name: '/jump', description: 'Jump directly to a position in the queue, skipping earlier tracks' },
      { name: '/history', description: 'Show the last 10 tracks played this session' },
    ],
  },
  utilities: {
    label: '🔧 Utilities',
    commands: [
      { name: '/ping', description: 'Check bot latency and WebSocket health' },
      { name: '/help', description: 'Show this help message' },
    ],
  },
};

const DEFAULT_CATEGORY = 'playback';
const COLLECTOR_TIMEOUT_MS = 5 * 60 * 1000;

function buildCommandText(categoryKey) {
  const category = CATEGORIES[categoryKey];
  const lines = category.commands
    .map(cmd => `\`${cmd.name}\` — ${cmd.description}`)
    .join('\n');
  return `### ${category.label}\n${lines}`;
}

function buildHelpComponents(selectedKey, disabled = false) {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('auralyn:help-category')
    .setPlaceholder('Choose a category...')
    .setDisabled(disabled)
    .addOptions(
      Object.entries(CATEGORIES).map(([key, cat]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(cat.label)
          .setValue(key)
          .setDefault(key === selectedKey),
      ),
    );

  const container = new ContainerBuilder()
    .setAccentColor(AuralynColors.primary)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '# Auralyn | Commands\nSelect a category below to browse all available commands.',
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(buildCommandText(selectedKey)),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(selectMenu),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available commands and how to use Auralyn'),

  async execute(interaction) {
    await interaction.deferReply();

    let selectedKey = DEFAULT_CATEGORY;
    await interaction.editReply(buildHelpComponents(selectedKey));

    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      filter: i => i.user.id === interaction.user.id && i.customId === 'auralyn:help-category',
      time: COLLECTOR_TIMEOUT_MS,
    });

    collector.on('collect', async i => {
      selectedKey = i.values[0];
      await i.update(buildHelpComponents(selectedKey));
    });

    collector.on('end', async () => {
      await interaction.editReply(buildHelpComponents(selectedKey, true)).catch(() => {});
    });
  },
};
