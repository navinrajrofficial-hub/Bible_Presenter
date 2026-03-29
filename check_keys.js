const fs = require('fs');
const content = fs.readFileSync('app.js', 'utf8');

// Use regex to roughly extract bibleData and tamilBibleBookNames
const bibleDataMatch = content.match(/const bibleData = \{([\s\S]*?)\n\};\n/);
const tamilNamesMatch = content.match(/const tamilBibleBookNames = \{([\s\S]*?)\n\};\n/);

if (!bibleDataMatch || !tamilNamesMatch) {
  console.log('Failed to match');
  process.exit();
}

const lines1 = bibleDataMatch[1].split('\n').map(l => l.trim()).filter(l => l.startsWith('\"'));
const lines2 = tamilNamesMatch[1].split('\n').map(l => l.trim()).filter(l => l.startsWith('\"'));

const keys1 = lines1.map(l => l.match(/\"([^\"]+)\"/)[1]);
const keys2 = lines2.map(l => l.match(/\"([^\"]+)\"/)[1]);

const onlyIn1 = keys1.filter(k => !keys2.includes(k));
const onlyIn2 = keys2.filter(k => !keys1.includes(k));

console.log('In bibleData but not in tamilBibleBookNames:', onlyIn1);
console.log('In tamilBibleBookNames but not in bibleData:', onlyIn2);
