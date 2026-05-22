import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { createEmbed, AuralynColors } from '../utils/embeds.js';

const CATEGORIES = [
  {
    name: 'Music Playback',
    commands: [
      { name: '/play', description: 'Play a song or add it to the queue (URL or search term)' },
      { name: '/playnext', description: 'Add a song to the front of the queue' },
      { name: '/skip', description: 'Skip the current track (vote-skip if enabled)' },
      { name: '/skipto', description: 'Skip to a specific position in the queue' },
      { name: '/previous', description: 'Play the previous track from history' },
      { name: '/stop', description: 'Stop the music and clear the queue' },
      { name: '/pause', description: 'Pause the current track' },
      { name: '/resume', description: 'Resume the current track' },
      { name: '/volume', description: 'Set the player volume (1–100)' },
      { name: '/nowplaying', description: 'Show the currently playing track' },
      { name: '/loop', description: 'Toggle loop mode (off / track / queue)' },
      { name: '/seek', description: 'Seek to a specific position in the current track' },
    ],
  },
  {
    name: 'Queue Management',
    commands: [
      { name: '/queue', description: 'View the current music queue' },
      { name: '/shuffle', description: 'Shuffle the queue' },
      { name: '/remove', description: 'Remove a track from the queue by position' },
      { name: '/clear', description: 'Clear the queue while keeping the current track' },
      { name: '/search', description: 'Search for a track and pick from results' },
    ],
  },
  {
    name: 'Audio & Filters',
    commands: [
      { name: '/filter', description: 'Apply an audio filter preset (bassboost, pop, rock, etc.)' },
      { name: '/lyrics', description: 'Fetch lyrics for the current or specified song' },
    ],
  },
  {
    name: 'Session Settings',
    commands: [
      { name: '/autoplay', description: 'Toggle autoplay of related tracks when queue ends' },
      { name: '/247', description: 'Toggle 24/7 mode (stay in VC even when alone)' },
    ],
  },
  {
    name: 'Utilities',
    commands: [
      { name: '/ping', description: 'Check bot latency and WebSocket health' },
      { name: '/invite', description: 'Get an invite link to add Auralyn to your server' },
      { name: '/help', description: 'Show this help message' },
    ],
  },
];

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available commands and how to use Auralyn')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    await interaction.deferReply();

    const embed = createEmbed({
      title: 'Auralyn | Commands',
      description: 'Crystal-clear audio, seamless playback, fast queues, smart search, smooth performance.\n\nUse the commands below to control your music experience.',
      color: AuralynColors.primary,
      timestamp: true,
      footer: { text: 'Auralyn music bot' },
    });

    for (const category of CATEGORIES) {
      const value = category.commands
        .map(cmd => `**${cmd.name}** — ${cmd.description}`)
        .join('\n');
      embed.addFields({ name: category.name, value, inline: false });
    }

    return interaction.editReply({ embeds: [embed] });
  },
};
