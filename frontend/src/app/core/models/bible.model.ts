export interface BibleBookInfo {
  name: string;
  en: string;
  tg: string;
  alt?: string;
  chapters: number;
  testament: 'OT' | 'NT';
}

export interface BibleVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface BibleChapterData {
  versesPerChapter: number[];
  content?: Record<number, Record<number, string>>;
}

export const BIBLE_BOOKS: BibleBookInfo[] = [
  // ── OLD TESTAMENT (39 Books) ──
  { name: "ஆதியாகமம்", en: "Genesis", tg: "Aathiyagamam", chapters: 50, testament: "OT" },
  { name: "யாத்திராகமம்", en: "Exodus", tg: "Yaathiragamam", chapters: 40, testament: "OT" },
  { name: "லேவியராகமம்", en: "Leviticus", tg: "Leviyaragamam", chapters: 27, testament: "OT" },
  { name: "எண்ணாகமம்", en: "Numbers", tg: "Ennagamam", chapters: 36, testament: "OT" },
  { name: "உபாகமம்", en: "Deuteronomy", tg: "Ubaagamam", chapters: 34, testament: "OT" },
  { name: "யோசுவா", en: "Joshua", tg: "Yosuva", chapters: 24, testament: "OT" },
  { name: "நியாயாதிபதிகள்", en: "Judges", tg: "Niyayadhipathigal", chapters: 21, testament: "OT" },
  { name: "ரூத்", en: "Ruth", tg: "Ruth", chapters: 4, testament: "OT" },
  { name: "1 சாமுவேல்", en: "1 Samuel", tg: "1 Samuvel", alt: "1 Samvel", chapters: 31, testament: "OT" },
  { name: "2 சாமுவேல்", en: "2 Samuel", tg: "2 Samuvel", alt: "2 Samvel", chapters: 24, testament: "OT" },
  { name: "1 இராஜாக்கள்", en: "1 Kings", tg: "1 Rajakkal", alt: "1 Irajakkal, 1 Irakkal, 1 Rajakal, 1 irajakal", chapters: 22, testament: "OT" },
  { name: "2 இராஜாக்கள்", en: "2 Kings", tg: "2 Rajakkal", alt: "2 Irajakkal, 2 Irakkal, 2 Rajakal, 2 irajakal", chapters: 25, testament: "OT" },
  { name: "1 நாளாகமம்", en: "1 Chronicles", tg: "1 Nalagamam", chapters: 29, testament: "OT" },
  { name: "2 நாளாகமம்", en: "2 Chronicles", tg: "2 Nalagamam", chapters: 36, testament: "OT" },
  { name: "எஸ்றா", en: "Ezra", tg: "Esra", chapters: 10, testament: "OT" },
  { name: "நெகேமியா", en: "Nehemiah", tg: "Nehemiya", chapters: 13, testament: "OT" },
  { name: "எஸ்தர்", en: "Esther", tg: "Esther", chapters: 10, testament: "OT" },
  { name: "யோபு", en: "Job", tg: "Yobu", chapters: 42, testament: "OT" },
  { name: "சங்கீதம்", en: "Psalms", tg: "Sangeetham", chapters: 150, testament: "OT" },
  { name: "நீதிமொழிகள்", en: "Proverbs", tg: "Neethimozhigal", chapters: 31, testament: "OT" },
  { name: "பிரசங்கி", en: "Ecclesiastes", tg: "Prasangi", chapters: 12, testament: "OT" },
  { name: "உன்னதப்பாட்டு", en: "Song of Solomon", tg: "Unnathappattu", chapters: 8, testament: "OT" },
  { name: "ஏசாயா", en: "Isaiah", tg: "Esaya", chapters: 66, testament: "OT" },
  { name: "எரேமியா", en: "Jeremiah", tg: "Eremiya", chapters: 52, testament: "OT" },
  { name: "புலம்பல்", en: "Lamentations", tg: "Pulambal", chapters: 5, testament: "OT" },
  { name: "எசேக்கியேல்", en: "Ezekiel", tg: "Esekkiyel", chapters: 48, testament: "OT" },
  { name: "தானியேல்", en: "Daniel", tg: "Dhaniyel", chapters: 12, testament: "OT" },
  { name: "ஓசேயா", en: "Hosea", tg: "Osiya", chapters: 14, testament: "OT" },
  { name: "யோவேல்", en: "Joel", tg: "Yovel", chapters: 3, testament: "OT" },
  { name: "ஆமோஸ்", en: "Amos", tg: "Amos", chapters: 9, testament: "OT" },
  { name: "ஒபதியா", en: "Obadiah", tg: "Obathiya", chapters: 1, testament: "OT" },
  { name: "யோனா", en: "Jonah", tg: "Yona", chapters: 4, testament: "OT" },
  { name: "மீகா", en: "Micah", tg: "Meega", chapters: 7, testament: "OT" },
  { name: "நாகூம்", en: "Nahum", tg: "Nagum", chapters: 3, testament: "OT" },
  { name: "ஆபகூக்", en: "Habakkuk", tg: "Aabakook", chapters: 3, testament: "OT" },
  { name: "செப்பனியா", en: "Zephaniah", tg: "Seppaniya", chapters: 3, testament: "OT" },
  { name: "ஆகாய்", en: "Haggai", tg: "Aagai", chapters: 2, testament: "OT" },
  { name: "சகரியா", en: "Zechariah", tg: "Sakariya", chapters: 14, testament: "OT" },
  { name: "மல்கியா", en: "Malachi", tg: "Malkiya", chapters: 4, testament: "OT" },

  // ── NEW TESTAMENT (27 Books) ──
  { name: "மத்தேயு", en: "Matthew", tg: "Matheyu", alt: "Mathew", chapters: 28, testament: "NT" },
  { name: "மாற்கு", en: "Mark", tg: "Markku", alt: "Mark", chapters: 16, testament: "NT" },
  { name: "லூக்கா", en: "Luke", tg: "Lookka", alt: "Luke", chapters: 24, testament: "NT" },
  { name: "யோவான்", en: "John", tg: "Yovan", alt: "John", chapters: 21, testament: "NT" },
  { name: "அப்போஸ்தலருடைய நடபடிகள்", en: "Acts", tg: "Apposthalar Nadapadigal", alt: "Acts, Apposthalar", chapters: 28, testament: "NT" },
  { name: "ரோமர்", en: "Romans", tg: "Romar", chapters: 16, testament: "NT" },
  { name: "1 கொரிந்தியர்", en: "1 Corinthians", tg: "1 Korinthiyar", alt: "1 Corin, 1 Cor", chapters: 16, testament: "NT" },
  { name: "2 கொரிந்தியர்", en: "2 Corinthians", tg: "2 Korinthiyar", alt: "2 Corin, 2 Cor", chapters: 13, testament: "NT" },
  { name: "கலாத்தியர்", en: "Galatians", tg: "Kalathiyar", alt: "Galatians", chapters: 6, testament: "NT" },
  { name: "எபேசியர்", en: "Ephesians", tg: "Ebesiyar", alt: "Ephesians", chapters: 6, testament: "NT" },
  { name: "பிலிப்பியர்", en: "Philippians", tg: "Bilippiyar", alt: "Philippians", chapters: 4, testament: "NT" },
  { name: "கொலோசியர்", en: "Colossians", tg: "Kolosiyar", alt: "Colossians", chapters: 4, testament: "NT" },
  { name: "1 தெசலோனிக்கேயர்", en: "1 Thessalonians", tg: "1 Thesalonikkaiyar", alt: "1 Thess", chapters: 5, testament: "NT" },
  { name: "2 தெசலோனிக்கேயர்", en: "2 Thessalonians", tg: "2 Thesalonikkaiyar", alt: "2 Thess", chapters: 3, testament: "NT" },
  { name: "1 தீமோத்தேயு", en: "1 Timothy", tg: "1 Theemotheyu", alt: "1 Tim", chapters: 6, testament: "NT" },
  { name: "2 தீமோத்தேயு", en: "2 Timothy", tg: "2 Theemotheyu", alt: "2 Tim", chapters: 4, testament: "NT" },
  { name: "தீத்து", en: "Titus", tg: "Theethu", alt: "Titus", chapters: 3, testament: "NT" },
  { name: "பிலேமோன்", en: "Philemon", tg: "Bilemon", alt: "Philemon", chapters: 1, testament: "NT" },
  { name: "எபிரேயர்", en: "Hebrews", tg: "Ebireyar", alt: "Hebrews", chapters: 13, testament: "NT" },
  { name: "யாக்கோபு", en: "James", tg: "Yaakkobu", alt: "James", chapters: 5, testament: "NT" },
  { name: "1 பேதுரு", en: "1 Peter", tg: "1 Pethuru", alt: "1 Pet", chapters: 5, testament: "NT" },
  { name: "2 பேதுரு", en: "2 Peter", tg: "2 Pethuru", alt: "2 Pet", chapters: 3, testament: "NT" },
  { name: "1 யோவான்", en: "1 John", tg: "1 Yovan", alt: "1 John", chapters: 5, testament: "NT" },
  { name: "2 யோவான்", en: "2 John", tg: "2 Yovan", alt: "2 John", chapters: 1, testament: "NT" },
  { name: "3 யோவான்", en: "3 John", tg: "3 Yovan", alt: "3 John", chapters: 1, testament: "NT" },
  { name: "யூதா", en: "Jude", tg: "Yootha", alt: "Jude", chapters: 1, testament: "NT" },
  { name: "வெளிப்படுத்தல்", en: "Revelation", tg: "Velipaduthal", alt: "Rev, Revelation", chapters: 22, testament: "NT" }
];
