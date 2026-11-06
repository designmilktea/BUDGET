export const MAX_AMOUNT = 1000000000;
export function parseAmount(input, allowZero = false) {
  const value = String(input).trim();
  if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(value)) throw new Error('Enter an amount with up to two decimal places.');
  const [whole, decimal = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > MAX_AMOUNT || cents < (allowZero ? 0 : 1)) throw new Error('Enter an amount between ' + (allowZero ? '$0.00' : '$0.01') + ' and $10,000,000.00.');
  return cents;
}
export function money(cents) { return (cents < 0 ? '−' : '') + '$' + (Math.abs(cents) / 100).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}); }
export function dayKey(date = new Date(), zone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function totals(budget, entries, day) {
  let spent = 0, selected = 0;
  for (const item of entries) {
    if (item.kind === 'purchase' && item.purchaseDate === day) spent += item.amount;
    if (item.kind === 'cart' && item.selected) selected += item.amount;
  }
  return {spent, selected, actual:budget-spent, projected:budget-spent-selected};
}
export function checkoutChanges(items, day, now) {
  if (!items.length) throw new Error('Select an item to check out.');
  if (items.some(x => x.kind !== 'cart' || !x.selected)) throw new Error('Your cart changed in another tab. Please try again.');
  return items.map(item => ({...item, kind:'purchase', selected:false, purchaseDate:day, purchasedAt:now, version:item.version+1}));
}
