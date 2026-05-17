import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set the player volume (1-100)')
    .addIntegerOption(option =>
      option.setName('volume')
        .setDescription('The volume percentage')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)),

  async execute(interaction, client, shoukaku) {
    await interaction.deferReply();

    if (!interaction.member.voice.channel) {
      return interaction.editReply('You need to be in a voice channel to use this command!');
    }

    const volume = interaction.options.getInteger('volume');

    try {
      const safeVolume = await client.musicPlayer.setVolume(interaction.guildId, volume);
      return interaction.editReply(`Set the volume to ${safeVolume}%`);
    } catch (error) {
      console.error('Error in volume command:', error);
      return interaction.editReply('There was an error while trying to set the volume!');
    }
  },
};
