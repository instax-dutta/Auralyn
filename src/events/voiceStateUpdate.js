import { Events } from 'discord.js';

export default {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState, client, shoukaku) {
    const { id: userId } = oldState.member?.user || newState.member?.user || {};
    if (userId === client.user?.id && oldState.channelId && !newState.channelId) {
      const guildId = oldState.guild.id;
      if (guildId) {
        client.musicPlayer.cleanupGuild(guildId);
        client.musicPlayer.players.delete(guildId);
      }
      return;
    }

    const guild = oldState.guild || newState.guild;
    if (!guild) return;

    const botVoiceState = guild.voiceStates.cache.get(client.user.id);
    if (!botVoiceState?.channelId) return;

    const botChannelId = botVoiceState.channelId;
    if (oldState.channelId === botChannelId || newState.channelId === botChannelId) {
      const channel = guild.channels.cache.get(botChannelId);
      if (!channel || !channel.isVoiceBased()) return;

      const members = channel.members.filter(member => !member.user.bot && member.id !== client.user.id);
      if (members.size === 0) {
        if (!client.aloneTimeouts) client.aloneTimeouts = new Map();
        const existingTimeout = client.aloneTimeouts.get(guild.id);
        if (existingTimeout) clearTimeout(existingTimeout);

        const timeoutId = setTimeout(async () => {
          const botVoiceStateCheck = guild.voiceStates.cache.get(client.user.id);
          if (botVoiceStateCheck?.channelId === botChannelId) {
            const channelCheck = guild.channels.cache.get(botChannelId);
            if (channelCheck && channelCheck.isVoiceBased()) {
              const membersCheck = channelCheck.members.filter(member => !member.user.bot && member.id !== client.user.id);
              if (membersCheck.size === 0) {
                try {
                  await client.musicPlayer.stop(guild.id);
                } catch (err) {
                  client.logger.error(`Error leaving voice channel in guild ${guild.id}`, err);
                }
              }
            }
          }

          if (client.aloneTimeouts) {
            client.aloneTimeouts.delete(guild.id);
          }
        }, 120000);

        client.aloneTimeouts.set(guild.id, timeoutId);
      } else {
        if (client.aloneTimeouts) {
          const existingTimeout = client.aloneTimeouts.get(guild.id);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
            client.aloneTimeouts.delete(guild.id);
          }
        }
      }
    }
  },
};
