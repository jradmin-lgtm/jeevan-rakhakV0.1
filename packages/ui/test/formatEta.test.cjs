const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const out = {};
new Function('exports', ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/maps/formatEta.ts'), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(out);
const {formatEta} = out;
test('fractional provider ETA never exposes long decimals', () => {
  assert.equal(formatEta(1.6683333333333332), '~2 min');
  assert.equal(formatEta(1.6683333333333332, 'hi'), 'लगभग 2 मिनट');
});
test('less than a minute stays explicit including zero rather than displaying zero minutes', () => {
  for(const value of [0,0.01,0.49,0.999999]) {
    assert.equal(formatEta(value), '<1 min');
    assert.equal(formatEta(value, 'hi'), '1 मिनट से कम');
  }
});
test('rounding boundaries and longer journey estimates remain readable', () => {
  for(const [value,expected] of [[1,1],[1.49,1],[1.5,2],[59.6,60],[123.456,123]]) {
    assert.equal(formatEta(value), `~${expected} min`);
    assert.equal(formatEta(value,'hi'), `लगभग ${expected} मिनट`);
  }
});
test('invalid and absent estimates are not presented as live zero-minute arrivals', () => {
  for(const value of [null,undefined,NaN,Infinity,-Infinity,-1]) {
    assert.equal(formatEta(value),'Unavailable');
    assert.equal(formatEta(value,'hi'),'उपलब्ध नहीं');
  }
});
