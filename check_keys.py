import re

with open('app.js', 'r', encoding='utf-8') as f:
    text = f.read()

m1 = re.search(r'const bibleData = \{(.*?)\n\};', text, re.DOTALL)
m2 = re.search(r'const tamilBibleBookNames = \{(.*?)\n\};', text, re.DOTALL)

lines1 = [x.strip() for x in m1.group(1).split('\n') if x.strip().startswith('"')]
lines2 = [x.strip() for x in m2.group(1).split('\n') if x.strip().startswith('"')]

keys1 = [re.search(r'"([^"]+)"', x).group(1) for x in lines1]
keys2 = [re.search(r'"([^"]+)"', x).group(1) for x in lines2]

print("In bibleData not in dict:", [k for k in keys1 if k not in keys2])
print("In dict not in bibleData:", [k for k in keys2 if k not in keys1])
