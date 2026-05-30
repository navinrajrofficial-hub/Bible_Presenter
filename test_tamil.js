const s1 = 'நடந்த';
const s2 = 'நடந்திடுவேன்';

console.log('Search term:', s1);
console.log('Song title:', s2);
console.log('Does title include search?', s2.includes(s1));
console.log('Does lowercase title include lowercase search?', s2.toLowerCase().includes(s1.toLowerCase()));

console.log('\nSearch term characters:');
Array.from(s1).forEach((c, i) => {
  console.log(`  ${i}: ${c} (U+${c.charCodeAt(0).toString(16).toUpperCase()})`);
});

console.log('\nSong title characters:');
Array.from(s2).forEach((c, i) => {
  console.log(`  ${i}: ${c} (U+${c.charCodeAt(0).toString(16).toUpperCase()})`);
});
