"""
Tamil Bible JSON -> bible_content.js converter

Usage:
  py convert_bible.py "Matthew"           → outputs one book
  py convert_bible.py "Matthew" "Mark"    → outputs multiple
  py convert_bible.py --all               → outputs all 66 books
  py convert_bible.py --all --file        → write all to bible_content_generated.js
  py convert_bible.py --list              → list available books
"""

import json, sys, os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
JSON_DIR = os.path.join(SCRIPT_DIR, 'tamil_bible_json')

# English filename -> Tamil name used in bibleData (from presenter_v3_Version2.html)
BOOK_MAP = {
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
}

def convert_book(english_name):
    json_file = os.path.join(JSON_DIR, f"{english_name}.json")
    if not os.path.exists(json_file):
        print(f"ERROR: File not found: {json_file}", file=sys.stderr)
        return None

    tamil_name = BOOK_MAP.get(english_name)
    if not tamil_name:
        print(f"ERROR: No Tamil mapping for '{english_name}'", file=sys.stderr)
        return None

    with open(json_file, 'r', encoding='utf-8') as f:
        raw = json.load(f)

    chapters = raw['chapters']
    chapter_count = int(raw['count'])

    verses_per_chapter = [len(ch['verses']) for ch in chapters]

    lines = []
    ch_label = "அதிகாரங்கள்" if chapter_count > 1 else "அதிகாரம்"
    v_total = sum(verses_per_chapter)
    lines.append(f'  // ──────────────────────────────────────────────────')
    lines.append(f'  //  {tamil_name}  ({english_name})  —  {chapter_count} {ch_label}, {v_total} வசனங்கள்')
    lines.append(f'  // ──────────────────────────────────────────────────')
    lines.append(f'  bibleData["{tamil_name}"].versesPerChapter = [{", ".join(str(v) for v in verses_per_chapter)}];')
    lines.append(f'  bibleData["{tamil_name}"].content = {{')

    for chapter in chapters:
        ch_num = int(chapter['chapter'])
        lines.append(f'    {ch_num}: {{')
        for verse in chapter['verses']:
            v_num = int(verse['verse'])
            text = verse['text'].replace('\\', '\\\\').replace('"', '\\"')
            pad = '  ' if v_num < 10 else (' ' if v_num < 100 else '')
            lines.append(f'    {pad}{v_num}: "{text}",')
        lines.append(f'    }},')

    lines.append(f'  }};')
    return '\n'.join(lines)


if __name__ == '__main__':
    args = sys.argv[1:]

    if not args or args[0] == '--help':
        print(__doc__)
        sys.exit(0)

    if args[0] == '--list':
        print('Available books:')
        for eng, tam in BOOK_MAP.items():
            print(f'  "{eng}" -> {tam}')
        sys.exit(0)

    write_to_file = '--file' in args
    if args[0] == '--all':
        book_names = list(BOOK_MAP.keys())
    else:
        book_names = [a for a in args if a != '--file']

    blocks = []
    for name in book_names:
        result = convert_book(name)
        if result:
            blocks.append(result)

    output = '\n\n'.join(blocks)

    if write_to_file:
        header = '''// ════════════════════════════════════════════════════
//  Tamil Bible Content — பரிசுத்த வேதாகமம்
//  Source: github.com/aruljohn/Bible-tamil (MIT License)
//  Auto-generated by convert_bible.py
// ════════════════════════════════════════════════════

(function injectBibleContent() {
  if (typeof bibleData === 'undefined') return;

'''
        footer = '''

})();
'''
        file_path = os.path.join(SCRIPT_DIR, 'bible_content_generated.js')
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(header + output + footer)
        print(f'Written to: {file_path}')
    else:
        sys.stdout.reconfigure(encoding='utf-8')
        print(output)
