import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current track'),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    if (!interaction.member.voice.channel) {
      return interaction.editReply('You need to be in a voice channel to use this command!');
    }

    try {
      const nextTrack = await client.musicPlayer.skip(interaction.guildId);
      return interaction.editReply(nextTrack ? 'Skipped the current track!' : 'There is nothing to skip.');
    } catch (error) {
      console.error('Error in skip command:', error);
      return interaction.editReply('There was an error while trying to skip the track!');
    }
  },
};
