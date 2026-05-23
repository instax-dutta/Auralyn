import { Events } from 'discord.js';
import { buildSimpleV2 } from '../utils/music-ui.js';
import { AuralynColors } from '../utils/embeds.js';

export default {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState, client) {
    const botId = client.user?.id;
    const movingUserId = (oldState.member?.user ?? newState.member?.user)?.id;

    if (movingUserId === botId) {
      const guildId = oldState.guild.id;
      if (oldState.channelId && !newState.channelId) {
        client.musicPlayer.cleanupGuild(guildId);
        client.musicPlayer.players.delete(guildId);
        client.telemetry?.trackVoiceDisconnected();
      } else if (!oldState.channelId && newState.channelId) {
        client.telemetry?.trackVoiceConnected();
      }
      return;
    }

    const guild = oldState.guild ?? newState.guild;
    if (!guild) return;

    const botVoiceState = guild.voiceStates.cache.get(botId);
    if (!botVoiceState?.channelId) return;

    const botChannelId = botVoiceState.channelId;
    if (oldState.channelId !== botChannelId && newState.channelId !== botChannelId) return;

    const channel = guild.channels.cache.get(botChannelId);
    if (!channel?.isVoiceBased()) return;

    const humanMembers = channel.members.filter(m => !m.user.bot);
    if (humanMembers.size > 0) return;

    const playerState = client.musicPlayer.getPlayerState(guild.id);
    const textChannel = playerState?.textChannel ?? null;

    try {
      if (textChannel) {
        await textChannel.send(buildSimpleV2(
          'Auralyn | Voice Session Ended',
          'All members have left the voice channel. Disconnecting now.',
          AuralynColors.info,
        )).catch(() => {});
      }
      await client.musicPlayer.stop(guild.id);
    } catch (err) {
      client.logger.error(`Error disconnecting from empty voice channel in guild ${guild.id}`, err);
    }
  },
};
