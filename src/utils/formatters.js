export function formatCount(value, noun) {
  return `${value} ${noun}${value === 1 ? '' : 's'}`;
}

export function formatLoopMode(mode) {
  return ['Off', 'Track', 'Queue'][mode] ?? 'Off';
}

export function parseTimeInput(input) {
  const trimmed = (input ?? '').trim();

  const colonForm = trimmed.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
  if (colonForm) {
    const hours = parseInt(colonForm[1] ?? '0', 10);
    const minutes = parseInt(colonForm[2], 10);
    const seconds = parseInt(colonForm[3], 10);
    if (minutes > 59 || seconds > 59) return null;
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }

  const rawSeconds = trimmed.match(/^(\d+)$/);
  if (rawSeconds) {
    return parseInt(rawSeconds[1], 10) * 1000;
  }

  return null;
}
