export class Telemetry {
  constructor(logger) {
    this.logger = logger;
    this.startedAt = Date.now();
    this.counts = {
      commandsExecuted: 0,
      tracksPlayed: 0,
      errors: 0,
      voiceConnections: 0,
      shardReconnects: 0,
    };
    this.commandBreakdown = {};
  }

  trackCommand(commandName) {
    this.counts.commandsExecuted++;
    this.commandBreakdown[commandName] = (this.commandBreakdown[commandName] || 0) + 1;
  }

  trackTrackPlayed() {
    this.counts.tracksPlayed++;
  }

  trackError() {
    this.counts.errors++;
  }

  trackVoiceConnected() {
    this.counts.voiceConnections++;
  }

  trackVoiceDisconnected() {
    if (this.counts.voiceConnections > 0) {
      this.counts.voiceConnections--;
    }
  }

  trackReconnect() {
    this.counts.shardReconnects++;
  }

  summary() {
    const uptime = Math.floor((Date.now() - this.startedAt) / 1000);
    return {
      uptimeSeconds: uptime,
      ...this.counts,
      commandsPerMinute: uptime > 0
        ? ((this.counts.commandsExecuted / uptime) * 60).toFixed(1)
        : '0.0',
      topCommands: Object.entries(this.commandBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count })),
    };
  }

  logSummary() {
    const s = this.summary();
    this.logger.info(
      `Telemetry: ${s.commandsExecuted} commands, ${s.tracksPlayed} tracks, `
      + `${s.errors} errors, ${s.voiceConnections} active connections, `
      + `${s.uptimeSeconds}s uptime`,
    );
  }
}
