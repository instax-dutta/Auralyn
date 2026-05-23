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
import { buildActionFeedback, replyWithPlayerSnapshot } from '../utils/music-ui.js';
import { AuralynColors } from '../utils/embeds.js';
import { trackTitle } from '../utils/tracks.js';

const VOTE_TIMEOUT_MS = 60_000;

function hasDjRole(member, config) {
  return Boolean(config?.djRoleId && member.roles.cache.has(config.djRoleId));
}

function requiredVotes(memberCount) {
  return Math.ceil(memberCount / 2);
}

function buildVoteV2(track, yesCount, required, disabled = false) {
  const remaining = Math.max(0, required - yesCount);
  const body = `**${yesCount}** of **${required}** votes to skip **${trackTitle(track)}**.\n${remaining} more vote${remaining === 1 ? '' : 's'} needed.`;

  const container = new ContainerBuilder()
    .setAccentColor(AuralynColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Auralyn | Vote Skip'))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Expires in 60 seconds.'))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('auralyn:voteskip-yes')
          .setLabel(`Skip  ${yesCount}/${required}`)
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId('auralyn:voteskip-no')
          .setLabel('Keep playing')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled),
      ),
    );

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

export default {
  data: new SlashCommandBuilder()
    .setName('voteskip')
    .setDescription('Start a vote to skip the current track, or force skip if you have the DJ role'),

  async execute(interaction, client) {
    await interaction.deferReply();

    const state = client.musicPlayer.getPlayerState(interaction.guildId);
    if (!state.isPlaying) {
      return interaction.editReply(buildActionFeedback('Nothing Playing', 'There is nothing playing to skip.', false));
    }

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.editReply(buildActionFeedback('Voice Required', 'Join the voice channel before voting to skip.', false));
    }

    if (hasDjRole(interaction.member, client.config)) {
      await client.musicPlayer.skip(interaction.guildId);
      return replyWithPlayerSnapshot(interaction, client, interaction.guildId, 'Auralyn | Force Skipped');
    }

    if (!client.activeVoteSkips) client.activeVoteSkips = new Map();
    if (client.activeVoteSkips.has(interaction.guildId)) {
      return interaction.editReply(buildActionFeedback('Vote Active', 'A vote skip is already in progress for this server.', false));
    }

    const humanMembers = voiceChannel.members.filter(m => !m.user.bot);
    const required = requiredVotes(humanMembers.size);
    const yesVoters = new Set([interaction.user.id]);
    const noVoters = new Set();

    if (yesVoters.size >= required) {
      await client.musicPlayer.skip(interaction.guildId);
      return replyWithPlayerSnapshot(interaction, client, interaction.guildId, 'Auralyn | Track Skipped');
    }

    const track = state.currentTrack;
    client.activeVoteSkips.set(interaction.guildId, true);

    await interaction.editReply(buildVoteV2(track, yesVoters.size, required));

    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: async i => {
        if (i.member?.voice?.channelId !== voiceChannel.id) {
          await i.reply({
            content: 'You must be in the voice channel to vote.',
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
          return false;
        }
        if (i.user.id === interaction.user.id) {
          await i.reply({
            content: 'You started this vote and already count as a yes.',
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
          return false;
        }
        if (yesVoters.has(i.user.id) || noVoters.has(i.user.id)) {
          await i.reply({
            content: 'You have already voted.',
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
          return false;
        }
        return true;
      },
      time: VOTE_TIMEOUT_MS,
    });

    collector.on('collect', async i => {
      if (i.customId === 'auralyn:voteskip-yes') {
        yesVoters.add(i.user.id);
      } else {
        noVoters.add(i.user.id);
      }

      await i.deferUpdate();

      if (yesVoters.size >= required) {
        collector.stop('passed');
        return;
      }

      await interaction.editReply(buildVoteV2(track, yesVoters.size, required)).catch(() => {});
    });

    collector.on('end', async (_, reason) => {
      client.activeVoteSkips.delete(interaction.guildId);

      if (reason === 'passed') {
        await client.musicPlayer.skip(interaction.guildId);
        await interaction.editReply(buildActionFeedback(
          'Vote Passed',
          `Vote passed with **${yesVoters.size}/${required}** votes. Skipping **${trackTitle(track)}**.`,
        )).catch(() => {});
      } else {
        await interaction.editReply(buildActionFeedback(
          'Vote Failed',
          `Vote failed — only **${yesVoters.size}/${required}** votes were cast.`,
          false,
        )).catch(() => {});
      }
    });
  },
};
