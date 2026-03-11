import sqlite3, json

conn = sqlite3.connect('tamilsongs.db')
cur = conn.cursor()
cur.execute("SELECT id, title, content, artist FROM songs ORDER BY id")
rows = cur.fetchall()
conn.close()

songs = []
for r in rows:
    entry = {
        'id': r[0],
        'title': r[1] or '',
        'content': r[2] or '',
        'artist': r[3] if r[3] is not None else ''
    }
    songs.append(entry)

with open('songs_data.js', 'w', encoding='utf-8') as f:
    f.write('// Auto-generated from tamilsongs.db\n')
    f.write('// Columns: id, title, content, artist\n')
    f.write('const songsData = ')
    json.dump(songs, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')

print(f"Exported {len(songs)} songs to songs_data.js")
