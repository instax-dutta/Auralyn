export function createInteraction({
  customId = 'music:track:1',
  guildId = 'guild-1',
  channelId = 'text-1',
  userId = 'user-1',
  member = {},
  replied = false,
  deferred = false,
} = {}) {
  const state = { replied, deferred, replyPayload: null, updatePayload: null };

  const interaction = {
    customId,
    guildId,
    channelId,
    userId,
    member,
    isRepliable: () => true,
    replied: false,
    deferred: false,
    async reply(payload) {
      if (state.replied || state.deferred) {
        throw new Error('InteractionAlreadyReplied');
      }
      state.replied = true;
      state.replyPayload = payload;
      interaction.replied = true;
      return interaction;
    },
    async deferReply() {
      state.deferred = true;
      interaction.deferred = true;
      return interaction;
    },
    async editReply(payload) {
      if (!state.deferred && !state.replied) {
        throw new Error('InteractionNotDeferred');
      }
      state.replyPayload = payload;
      return interaction;
    },
    async deferUpdate() {
      state.deferred = true;
      interaction.deferred = true;
      return interaction;
    },
    async update(payload) {
      if (!state.replied && !state.deferred) {
        throw new Error('InteractionNotReplied');
      }
      state.updatePayload = payload;
      return interaction;
    },
  };

  interaction.state = state;
  return interaction;
}