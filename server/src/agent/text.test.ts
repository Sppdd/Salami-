import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractJson, normalizePhone, speakable, stripThinking } from './text.js';

test('stripThinking removes closed, unclosed and orphan-close reasoning blocks', () => {
  assert.equal(stripThinking('<think>plan</think>{"a":1}'), '{"a":1}');
  assert.equal(stripThinking('answer <think>never finished'), 'answer');
  assert.equal(stripThinking('reasoning here</think> final'), 'final');
});

test('extractJson handles fences, prose, nested braces and trailing commas', () => {
  assert.deepEqual(extractJson('```json\n{"say":"hi {there}","end_call":false}\n```'), { say: 'hi {there}', end_call: false });
  assert.deepEqual(extractJson('Sure! {"a": {"b": [1,2,]},} thanks'), { a: { b: [1, 2] } });
  assert.deepEqual(extractJson('<think>{"draft":true}</think>{"final":true}'), { final: true });
  assert.equal(extractJson('no json at all'), null);
});

test('speakable strips markdown and emoji and trims at a sentence', () => {
  assert.equal(speakable('**Great!** See [site](http://x) 🎉'), 'Great! See site');
  const long = 'One sentence here. '.repeat(10);
  assert.ok(speakable(long, 60).endsWith('.'));
});

test('normalizePhone produces E.164', () => {
  assert.equal(normalizePhone('(415) 555-0100'), '+14155550100');
  assert.equal(normalizePhone('1-415-555-0100'), '+14155550100');
  assert.equal(normalizePhone('+44 20 7946 0958'), '+442079460958');
  assert.equal(normalizePhone('12345'), null);
});
