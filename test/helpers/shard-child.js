if (typeof process.send === 'function') {
  await import('../../src/index.js');
  process.send({ type: 'ready' });
  process.channel.ref();
}