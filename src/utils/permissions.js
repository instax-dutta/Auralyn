import { PermissionFlagsBits } from 'discord.js';

export function isAdminLikeMember(member) {
  return member?.permissions?.has?.(PermissionFlagsBits.Administrator)
    || member?.permissions?.has?.('Administrator')
    || false;
}

export function hasDjRole(member, settings) {
  const djRoleIds = settings?.djRoleIds ?? [];
  if (djRoleIds.length === 0) return false;

  return djRoleIds.some((roleId) => member?.roles?.cache?.has?.(roleId));
}

export function isSameVoiceChannel(member, botVoiceChannelId) {
  return Boolean(
    member?.voice?.channelId
    && botVoiceChannelId
    && member.voice.channelId === botVoiceChannelId,
  );
}

export function canManagePlayback({ member, track, settings }) {
  if (!member) return false;
  if (settings?.controlMode !== 'requester_or_dj') return true;
  if (isAdminLikeMember(member)) return true;
  if (hasDjRole(member, settings)) return true;
  return track?.requestedByUserId != null && track.requestedByUserId === member.id;
}

export function canUsePlayerControls({ member, botVoiceChannelId, track, settings }) {
  if (!isSameVoiceChannel(member, botVoiceChannelId)) return false;
  return canManagePlayback({ member, track, settings });
}

/**
 * Higher-level policy wrappers returning `{ allowed, reply }` objects.
 * `reply` is a payload ready for `interaction.editReply()` when `allowed` is false.
 */

export function requireVoice(interaction) {
  if (interaction.member?.voice?.channel) return { allowed: true };
  return {
    allowed: false,
    reply: {
      embeds: [
        {
          color: 0xE74C3C,
          description: 'You must be in a voice channel to use this command.',
          title: 'Voice Required',
        },
      ],
      components: [],
    },
  };
}

export function requireSameVoiceChannel(interaction) {
  const botVoiceChannelId = interaction.guild?.members?.me?.voice?.channelId;
  if (!botVoiceChannelId) return { allowed: true };
  if (interaction.member?.voice?.channelId === botVoiceChannelId) return { allowed: true };
  return {
    allowed: false,
    reply: {
      embeds: [
        {
          color: 0xE74C3C,
          description: 'You must be in the same voice channel as the bot to use this command.',
          title: 'Voice Session Locked',
        },
      ],
      components: [],
    },
  };
}

export function requireDjOrAdmin(interaction, settings) {
  if (isAdminLikeMember(interaction.member)) return { allowed: true };
  if (!settings || !settings.controlMode || settings.controlMode === 'everyone') return { allowed: true };
  if (hasDjRole(interaction.member, settings)) return { allowed: true };
  return {
    allowed: false,
    reply: {
      embeds: [
        {
          color: 0xE74C3C,
          description: 'You need a DJ role or administrator permissions to use this command.',
          title: 'Permission Denied',
        },
      ],
      components: [],
    },
  };
}
