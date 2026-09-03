export function formatPHP(amount) {
  return `₱${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function formatRate(rate) {
  return `${(Number(rate) * 100).toLocaleString(undefined, { maximumFractionDigits: 3 })}%`;
}
