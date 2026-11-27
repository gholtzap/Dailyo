"""Rebuild 1,000 common-word layouts while retaining the original 120."""
import json,collections,itertools,random
from pathlib import Path
import re
path=Path('src/games/boards/word-board-data.ts');text=path.read_text();old=json.loads(text.split('export const wordBoards: string[][] = ')[1].rstrip().rstrip(';').replace(',\n]', '\n]'))
words=re.findall(r'^  ([A-Z]{5}):',text,re.M);random.Random(27).shuffle(words)
index=collections.defaultdict(list)
for w in words:index[(w[0],w[2],w[4])].append(w)
boards=old[:120];seen={tuple(b) for b in boards}
for top in words:
 added=0
 for middle in words:
  if top==middle:continue
  for bottom in words:
   if bottom in (top,middle):continue
   choices=[index.get((top[i],middle[i],bottom[i]),[]) for i in (0,2,4)]
   if not all(choices):continue
   for cols in itertools.product(*choices):
    row=[top,middle,bottom,*cols]
    if len(set(row))==6 and tuple(row) not in seen:
     boards.append(row);seen.add(tuple(row));added+=1
     if added>=8 or len(boards)>=1000:break
   if added>=8 or len(boards)>=1000:break
  if added>=8 or len(boards)>=1000:break
 if len(boards)>=1000:break
text=text.split('export const wordBoards: string[][] = ')[0]+'export const wordBoards: string[][] = '+json.dumps(boards,indent=2)+';\n'
path.write_text(text)
print(len(boards),'crossing layouts')
