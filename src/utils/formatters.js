export function formatCount(value, noun) {
  return `${value} ${noun}${value === 1 ? '' : 's'}`;
}

export function formatLoopMode(mode) {
  return ['Off', 'Track', 'Queue'][mode] ?? 'Off';
}
