import { Events } from 'discord.js';

export default {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState, client, shoukaku) {
    const { id: userId } = oldState.member?.user || newState.member?.user || {};
    // We are only interested in the bot's own voice state changes
    if (userId !== client.user?.id) return;

    const oldChannel = oldState.channelId;
    const newChannel = newState.channelId;

    // If the bot has left a voice channel (either disconnected or moved)
    if (!newChannel && oldChannel) {
      // The bot has been disconnected from the voice channel (or the channel was deleted)
      // Clean up the player state for the guild
      const guildId = oldState.guildId;
      if (guildId) {
        client.musicPlayer.stop(guildId);
        client.musicPlayer.cleanupGuild(guildId);
      }
      return;
    }

    // If the bot has joined a voice channel, we don't need to do anything here
    // The actual playing is handled by the play command.

    // We want to implement auto-disconnect when the bot is alone in a voice channel for a certain period.
    // However, we cannot set a timeout in this event because we would need to track per guild and cancel if someone joins.
    // Instead, we can check the voice state periodically or when the voice state updates (e.g., when someone leaves).
    // We'll do: when the voice state updates (anyone's), check if the bot is in a voice channel and if it's alone.
    // But note: this event is for the bot's own voice state. We need to listen to voice state updates for everyone.
    // Actually, the event we are in is for any voice state update. We checked that the userId is the bot's.
    // We need to change: we want to listen to any voice state update, not just the bot's.
    // Let's adjust: we remove the early return and instead check if the update is for the bot or for others in the bot's channel.

    // We'll change the approach: we want to check, whenever a voice state update occurs in a guild where the bot is connected,
    // whether the bot is now alone in the voice channel.
    // We'll do this for any voice state update (member moved, joined, left) in the guild where the bot is in a voice channel.

    // However, to avoid too many checks, we can do it only when the update is in the same guild and channel as the bot.
    // We'll get the bot's voice connection for the guild.

    // Since we are in the voiceStateUpdate event, we have the oldState and newState for a member.
    // We can check if the guild of this state is a guild where the bot is in a voice channel.
    const guild = oldState.guild || newState.guild;
    if (!guild) return;

    // Get the bot's voice state in this guild
    const botVoiceState = guild.voiceStates.get(client.user.id);
    if (!botVoiceState?.channelId) {
      // Bot is not in a voice channel in this guild, nothing to do
      return;
    }

    const botChannelId = botVoiceState.channelId;

    // Check if the voice state update is for the bot's channel
    if (oldState.channelId === botChannelId || newState.channelId === botChannelId) {
      // Now check how many humans are in the bot's channel (excluding bots and the bot itself)
      const channel = guild.channels.cache.get(botChannelId);
      if (!channel || !channel.isVoiceBased()) return;

      // Filter out bots and the bot itself
      const members = channel.members.filter(member => !member.user.bot && member.id !== client.user.id);
      if (members.size === 0) {
        // The bot is alone in the voice channel
        // We can set a timeout to disconnect after, say, 2 minutes of being alone.
        // However, we don't want to set a timeout every time we check because we might set multiple.
        // Instead, we can have a map of guildId to timeout ID.
        // We'll clear any existing timeout and set a new one.
        // If someone joins before the timeout, we clear the timeout.

        // We'll store the timeout on the client for simplicity.
        if (!client.aloneTimeouts) client.aloneTimeouts = new Map();
        const existingTimeout = client.aloneTimeouts.get(guild.id);
        if (existingTimeout) clearTimeout(existingTimeout);

        // Set a timeout to disconnect after 2 minutes (120000 ms)
        const timeoutId = setTimeout(async () => {
          // Check again if the bot is still alone (because the state might have changed)
          const botVoiceStateCheck = guild.voiceStates.get(client.user.id);
          if (botVoiceStateCheck?.channelId === botChannelId) {
            const channelCheck = guild.channels.cache.get(botChannelId);
            if (channelCheck && channelCheck.isVoiceBased()) {
              const membersCheck = channelCheck.members.filter(member => !member.user.bot && member.id !== client.user.id);
              if (membersCheck.size === 0) {
                // Still alone, disconnect
                try {
                  await channelCheck.leave();
                  // Clean up player state
                  client.musicPlayer.stop(guild.id);
                  client.musicPlayer.cleanupGuild(guild.id);
                } catch (err) {
                  console.error(`Error leaving voice channel in guild ${guild.id}:`, err);
                }
              }
            }
          }
          // Clean up the timeout reference
          if (client.aloneTimeouts) {
            client.aloneTimeouts.delete(guild.id);
          }
        }, 120000); // 2 minutes

        client.aloneTimeouts.set(guild.id, timeoutId);
      } else {
        // There are non-bot members, so clear any existing timeout
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