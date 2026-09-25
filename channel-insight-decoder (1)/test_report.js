const pSign = profit => profit > 0 ? '+' : (profit < 0 ? '-' : '');
console.log(pSign(-50) + Math.abs(-50).toFixed(2));
console.log(pSign(50) + Math.abs(50).toFixed(2));
