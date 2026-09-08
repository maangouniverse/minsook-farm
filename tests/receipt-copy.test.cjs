const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../shop.js'), 'utf8');
const start = source.indexOf("success.querySelector('#receiptCopyAccount').onclick = async () => {");
const end = source.indexOf('\n      };', start) + '\n      };'.length;
assert.ok(start > 0 && end > start);
(async () => {
  for (const rejected of [false, true]) {
    const button = {}, feedback = {}; let copied, focused = false, selected = false;
    const context = { success: { querySelector: selector => selector === '#receiptCopyAccount' ? button : feedback }, account: { accountNumber: 'TEST-ACCOUNT-ONLY' }, accountInput: { focus: () => { focused = true; }, select: () => { selected = true; } }, navigator: { clipboard: { writeText: async text => { if (rejected) throw new Error('permission denied'); copied = text; } } } };
    vm.runInNewContext(source.slice(start, end), context);
    await button.onclick();
    if (rejected) {
      assert.match(feedback.textContent, /직접 선택/); assert.equal(focused && selected, true);
    } else {
      assert.equal(copied, 'TEST-ACCOUNT-ONLY'); assert.equal(feedback.textContent, '계좌번호가 복사되었습니다');
    }
  }
  console.log('PASS: actual receipt copy handler copies only account number; permission failure focuses/selects the account and gives manual-copy guidance.');
})();
