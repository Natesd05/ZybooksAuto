// Reproduce control-flow defects without opening zyBooks or running real timers.
// Usage: node research/check-original.mjs /path/to/extracted/content.js
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(process.argv[2], 'utf8');
function setup({ radios = [], next = [] } = {}) {
  const intervals = [];
  const timeouts = [];
  let listener;
  let cleared = 0;
  const context = vm.createContext({
    console: { log() {} },
    document: {
      querySelectorAll(selector) {
        return selector === 'input[type=radio]' ? radios : [];
      },
      getElementsByClassName(name) {
        return name === 'nav-text next' ? next : [];
      },
    },
    chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; } } } },
    setInterval(fn, ms) { intervals.push({ fn, ms }); return intervals.length; },
    setTimeout(fn, ms) { timeouts.push({ fn, ms }); return timeouts.length; },
    clearInterval() { cleared++; },
  });
  vm.runInContext(source, context, { timeout: 1000 });
  return { context, intervals, timeouts, send: (message) => listener({ message }),
    cleared: () => cleared };
}

const results = [];
{
  const h = setup();
  assert.equal(h.context.getStatus(), true);
  results.push('CONFIRMED: zero detected status elements returns complete=true.');
}
{
  const h = setup();
  h.send('solveAll');
  assert.equal(h.intervals.length, 2);
  h.send('solveAll');
  assert.equal(h.intervals.length, 4);
  assert.equal(h.cleared(), 0);
  results.push('CONFIRMED: two solveAll commands register four intervals; none is cleared.');
}
{
  const clicks = [];
  const h = setup({ radios: [0, 1, 2].map(i => ({ click() { clicks.push(i); } })) });
  h.context.solveMultipleChoice();
  for (let i = 0; i < 5; i++) h.intervals[0].fn();
  assert.deepEqual(clicks, [0, 1, 2]);
  assert.equal(h.cleared(), 0);
  results.push('CONFIRMED: MCQ routine clicks every supplied radio and leaves its timer registered after exhaustion.');
}
{
  let clicks = 0;
  const h = setup({ next: [{ click() { clicks++; } }] });
  h.send('solveAuto');
  const navigation = h.intervals.find(t => t.ms === 1000);
  navigation.fn();
  navigation.fn();
  assert.equal(clicks, 2);
  results.push('CONFIRMED: empty status scan allows repeated next clicks without destination confirmation.');
}
console.log(results.join('\n'));
console.log('4/4 mock checks passed. These establish source behavior, not live-site compatibility.');
