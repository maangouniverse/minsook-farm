// Run the real calculator functions, without a browser or any database writes.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../script_new.js'), 'utf8');
const functions = [
  source.slice(source.indexOf('  function getWeights('), source.indexOf('  function getCappedQuantity(')),
  source.slice(source.indexOf('  function calculateOrder('), source.indexOf('  function setBarColor('))
].join('\n');
const context = {
  priceConfig: {
    kg: { name: '무게', price: 7900, isQty: false, isBite: false, unit: 'kg', step: 1 },
    qty: { name: '개수', price: 5500, isQty: true, isBite: false, unit: '개', step: 10 },
    bite: { name: '한입', price: 5800, isQty: false, isBite: true, unit: 'kg', step: 0.5 }
  },
  orderState: {}, orderType: 'delivery', paymentMethod: 'bank', currentQuote: {},
  weightBar: null, limitWeightText: null, currentFinalTotal: 0,
  document: { getElementById: () => null, dispatchEvent: () => {} },
  window: { MinsookOrder: { snapshot: () => ({}) } },
  CustomEvent: class {}, updateSMSPreview: () => {}
};
vm.createContext(context);
vm.runInContext(functions, context);
const cases = [
  [{}, 'delivery', 0, 0, 0, 0],
  [{ kg: 1 }, 'delivery', 7900, 0, 0, 11900],
  [{ kg: 2 }, 'delivery', 15800, 2, 320, 19480],
  [{ kg: 3 }, 'delivery', 23700, 3, 720, 26980],
  [{ kg: 12 }, 'delivery', 94800, 12, 11380, 87420],
  [{ bite: 0.5 }, 'delivery', 2900, 0, 0, 6900],
  [{ bite: 1.5 }, 'delivery', 8700, 0, 0, 12700],
  [{ bite: 2 }, 'pickup', 11600, 2, 240, 11360],
  [{ kg: 1, qty: 10 }, 'delivery', 13400, 2, 270, 17130],
  [{ qty: 20 }, 'pickup', 11000, 2, 220, 10780],
  [{ bite: 6, kg: 3 }, 'pickup', 58500, 9, 5270, 53230]
];
for (const [state, type, subtotal, rate, discount, total] of cases) {
  context.orderState = state; context.orderType = type; context.calculateOrder();
  const q = context.currentQuote;
  assert.deepEqual([q.subtotal, q.discountRate, q.discountAmount, q.total], [subtotal, rate, discount, total]);
}
for (const [state, valid] of [[{ bite: 6 }, true], [{ bite: 6.5 }, false], [{ bite: 6, kg: 3 }, true], [{ bite: 6, kg: 4 }, false], [{ kg: 12 }, true], [{ kg: 13 }, false], [{ qty: 60 }, true], [{ qty: 70 }, false], [{ bite: 6, qty: 20 }, false]]) {
  assert.equal(context.isValidState(state), valid, JSON.stringify(state));
}
console.log(`PASS: ${cases.length} pricing cases and 9 weight-limit cases (no database access).`);
// Exercise the catalog adapter with admin-defined dual-unit options and steps.
const adapterContext = { ...context, window: {}, renderProductSelectOptions: () => {}, renderMainPageProductCards: () => {}, formatWeight: value => String(value) };
vm.createContext(adapterContext);
const adapter = source.slice(source.indexOf('  let shopProducts = []'), source.indexOf('  const productSelect ='));
const productFunctions = source.slice(source.indexOf('  function getProductUnits('), source.indexOf('  function renderProductSelectOptions('));
vm.runInContext(functions + adapter + productFunctions, adapterContext);
adapterContext.applyProducts([{ id: 99, name: '테스트 복수 옵션', price: 7900, price_qty: 8500, unit: 'kg,개', step: 0.5, step_qty: 10, is_bite: 0, image_url: '["test.jpg","test2.jpg"]' }]);
adapterContext.orderState = {};
const api = adapterContext.window.MinsookOrder;
assert.equal(api.setQuantity('99:kg', 0.5), true);
assert.equal(api.setQuantity('99:kg', 0.7), false);
assert.equal(api.setQuantity('99:개', 10), true);
assert.equal(api.setQuantity('99:개', 11), false);
assert.equal(api.setQuantity('99:개', Infinity), false);
assert.equal(api.setQuantity('missing', 1), false);
const snapshot = api.snapshot();
assert.equal(snapshot.products[0].options.length, 2);
assert.equal(snapshot.products[0].options[1].price, 8500);
assert.equal(snapshot.products[0].images.length, 2);
assert.equal(snapshot.subtotal, 12450);
assert.equal(api.setQuantity('99:개', 0), true);
assert.equal(api.snapshot().items.length, 1);
assert.equal(api.snapshot().subtotal, 3950);
console.log('PASS: admin dual-unit prices, custom steps, invalid input and item removal.');
