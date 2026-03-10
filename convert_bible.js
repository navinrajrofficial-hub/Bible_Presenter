/**
 * Tamil Bible JSON → bible_content.js converter
 * 
 * Usage:
 *   node convert_bible.js "Matthew"           → outputs மத்தேயு JS block
 *   node convert_bible.js "Matthew" "Mark"    → outputs both
 *   node convert_bible.js --all               → outputs all 66 books
 *   node convert_bible.js --list              → lists available books
 */

const fs = require('fs');
const path = require('path');

const JSON_DIR = path.join(__dirname, 'tamil_bible_json');

// English filename → Tamil name used in bibleData (from presenter_v3_Version2.html)
const BOOK_MAP = {
  "Genesis":         "ஆதியாகமம்",
  "Exodus":          "யாத்திராகமம்",
  "Leviticus":       "லேவியராகமம்",
  "Numbers":         "எண்ணாகமம்",
  "Deuteronomy":     "உபாகமம்",
  "Joshua":          "யோசுவா",
  "Judges":          "நியாயாதிபதிகள்",
  "Ruth":            "ரூத்",
  "1 Samuel":        "1 சாமுவேல்",
  "2 Samuel":        "2 சாமுவேல்",
  "1 Kings":         "1 இராஜாக்கள்",
  "2 Kings":         "2 இராஜாக்கள்",
  "1 Chronicles":    "1 நாளாகமம்",
  "2 Chronicles":    "2 நாளாகமம்",
  "Ezra":            "எஸ்றா",
  "Nehemiah":        "நெகேமியா",
  "Esther":          "எஸ்தர்",
  "Job":             "யோபு",
  "Psalms":          "சங்கீதம்",
  "Proverbs":        "நீதிமொழிகள்",
  "Ecclesiastes":    "பிரசங்கி",
  "Song of Songs":   "உன்னதப்பாட்டு",
  "Isaiah":          "ஏசாயா",
  "Jeremiah":        "எரேமியா",
  "Lamentations":    "புலம்பல்",
  "Ezekiel":         "எசேக்கியேல்",
  "Daniel":          "தானியேல்",
  "Hosea":           "ஓசேயா",
  "Joel":            "யோவேல்",
  "Amos":            "ஆமோஸ்",
  "Obadiah":         "ஒபதியா",
  "Jonah":           "யோனா",
  "Micah":           "மீகா",
  "Nahum":           "நாகூம்",
  "Habakkuk":        "ஆபகூக்",
  "Zephaniah":       "செப்பனியா",
  "Haggai":          "ஆகாய்",
  "Zechariah":       "சகரியா",
  "Malachi":         "மல்கியா",
  "Matthew":         "மத்தேயு",
  "Mark":            "மாற்கு",
  "Luke":            "லூக்கா",
  "John":            "யோவான்",
  "Acts":            "அப்போஸ்தலருடைய நடபடிகள்",
  "Romans":          "ரோமர்",
  "1 Corinthians":   "1 கொரிந்தியர்",
  "2 Corinthians":   "2 கொரிந்தியர்",
  "Galatians":       "கலாத்தியர்",
  "Ephesians":       "எபேசியர்",
  "Philippians":     "பிலிப்பியர்",
  "Colossians":      "கொலோசியர்",
  "1 Thessalonians": "1 தெசலோனிக்கேயர்",
  "2 Thessalonians": "2 தெசலோனிக்கேயர்",
  "1 Timothy":       "1 தீமோத்தேயு",
  "2 Timothy":       "2 தீமோத்தேயு",
  "Titus":           "தீத்து",
  "Philemon":        "பிலேமோன்",
  "Hebrews":         "எபிரேயர்",
  "James":           "யாக்கோபு",
  "1 Peter":         "1 பேதுரு",
  "2 Peter":         "2 பேதுரு",
  "1 John":          "1 யோவான்",
  "2 John":          "2 யோவான்",
  "3 John":          "3 யோவான்",
  "Jude":            "யூதா",
  "Revelation":      "வெளிப்படுத்தல்",
};

function convertBook(englishName) {
  const jsonFile = path.join(JSON_DIR, `${englishName}.json`);
  if (!fs.existsSync(jsonFile)) {
    console.error(`ERROR: File not found: ${jsonFile}`);
    return null;
  }

  const tamilName = BOOK_MAP[englishName];
  if (!tamilName) {
    console.error(`ERROR: No Tamil mapping for "${englishName}"`);
    return null;
  }

  const raw = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  const chapters = raw.chapters;
  const chapterCount = parseInt(raw.count, 10);

  // Build versesPerChapter array
  const versesPerChapter = chapters.map(ch => ch.verses.length);

  // Build content
  let lines = [];
  lines.push(`  // ──────────────────────────────────────────────────`);
  lines.push(`  //  ${tamilName}  (${englishName})  —  ${chapterCount} அதிகாரம்${chapterCount > 1 ? 'கள்' : ''}`);
  lines.push(`  // ──────────────────────────────────────────────────`);
  lines.push(`  bibleData["${tamilName}"].versesPerChapter = [${versesPerChapter.join(', ')}];`);
  lines.push(`  bibleData["${tamilName}"].content = {`);

  for (const chapter of chapters) {
    const chNum = parseInt(chapter.chapter, 10);
    lines.push(`    ${chNum}: {`);
    for (const verse of chapter.verses) {
      const vNum = parseInt(verse.verse, 10);
      // Escape quotes in text
      const text = verse.text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const pad = vNum < 10 ? '  ' : (vNum < 100 ? ' ' : '');
      lines.push(`    ${pad}${vNum}: "${text}",`);
    }
    lines.push(`    },`);
  }
  lines.push(`  };`);

  return lines.join('\n');
}

// ── CLI ──
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help') {
  console.log('Usage:');
  console.log('  node convert_bible.js "Matthew"         → convert one book');
  console.log('  node convert_bible.js "Matthew" "Mark"  → convert multiple');
  console.log('  node convert_bible.js --all              → convert all 66 books');
  console.log('  node convert_bible.js --list             → list available books');
  console.log('  node convert_bible.js --all --file       → write all to bible_content_generated.js');
  process.exit(0);
}

if (args[0] === '--list') {
  console.log('Available books:');
  for (const [eng, tam] of Object.entries(BOOK_MAP)) {
    console.log(`  "${eng}" → ${tam}`);
  }
  process.exit(0);
}

const writeToFile = args.includes('--file');
const bookNames = args[0] === '--all' 
  ? Object.keys(BOOK_MAP) 
  : args.filter(a => a !== '--file');

const blocks = [];
for (const name of bookNames) {
  const result = convertBook(name);
  if (result) blocks.push(result);
}

const output = blocks.join('\n\n');

if (writeToFile) {
  const header = `// ════════════════════════════════════════════════════
//  Tamil Bible Content — பரிசுத்த வேதாகமம்
//  Source: github.com/aruljohn/Bible-tamil (MIT License)
//  Auto-generated by convert_bible.js
// ════════════════════════════════════════════════════

(function injectBibleContent() {
  if (typeof bibleData === 'undefined') return;

`;
  const footer = `
})();
`;
  const filePath = path.join(__dirname, 'bible_content_generated.js');
  fs.writeFileSync(filePath, header + output + footer, 'utf8');
  console.log(`Written to: ${filePath}`);
} else {
  console.log(output);
}
