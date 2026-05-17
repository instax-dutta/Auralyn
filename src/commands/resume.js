import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume the current track'),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    if (!interaction.member.voice.channel) {
      return interaction.editReply('You need to be in a voice channel to use this command!');
    }

    try {
      const resumed = await client.musicPlayer.resume(interaction.guildId);
      return interaction.editReply(resumed ? 'Resumed the current track!' : 'Nothing is currently paused.');
    } catch (error) {
      console.error('Error in resume command:', error);
      return interaction.editReply('There was an error while trying to resume the track!');
    }
  },
};
