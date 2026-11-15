import re,zipfile,json,sys
from pathlib import Path
codes={'amh':'Amharic','arb':'Arabic','ben':'Bengali','bul':'Bulgarian','cat':'Catalan','ces':'Czech','cym':'Welsh','dan':'Danish','deu':'German','eng':'English','est':'Estonian','eus':'Basque','fin':'Finnish','fra':'French','gle':'Irish','glg':'Galician','guj':'Gujarati','heb':'Hebrew','hin':'Hindi','hrv':'Croatian','hun':'Hungarian','hye':'Armenian','ibo':'Igbo','ind':'Indonesian','isl':'Icelandic','ita':'Italian','jpn':'Japanese','kan':'Kannada','kat':'Georgian','kaz':'Kazakh','khm':'Khmer','kor':'Korean','lao':'Lao','lav':'Latvian','lit':'Lithuanian','mal':'Malayalam','mar':'Marathi','mya':'Burmese','nep':'Nepali','nld':'Dutch','pan':'Punjabi','pol':'Polish','ron':'Romanian','rus':'Russian','slk':'Slovak','som':'Somali','spa':'Spanish','swe':'Swedish','tam':'Tamil','tha':'Thai','tur':'Turkish','ukr':'Ukrainian','urd':'Urdu','vie':'Vietnamese','xho':'Xhosa','yor':'Yoruba','zul':'Zulu','cmn_hans':'Chinese','ell_monotonic':'Greek','nob':'Norwegian','pes_1':'Persian','por_BR':'Portuguese','azj_latn':'Azerbaijani','afr':'Afrikaans','swh':'Swahili','sqi':'Albanian','fil':'Filipino','mlt':'Maltese'}
z=zipfile.ZipFile(sys.argv[1]); result=[]
for code,name in codes.items():
 try:text=z.read(f'udhr2/{code}.txt').decode('utf-8-sig')
 except KeyError: print('missing',code);continue
 samples=[]
 for line in text.splitlines():
  line=' '.join(line.split());line=re.sub(r'^\s*[\(\[]?\d+[\)\].:、．]?\s*','',line)
  for sentence in re.split(r'(?<=[.!?。！？।።։۔])\s*',line):
   sentence=sentence.strip();letters=sum(ch.isalpha() for ch in sentence)
   if 55<=len(sentence)<=180 and letters>=18 and (sentence[-1:] in '.!?。！？।።։۔' or code=='tha') and not re.search(r'\d|https?://|www\.',sentence) and sentence not in samples:
    samples.append(sentence)
 if len(samples)<3:print('short',code,len(samples));continue
 result.append({'id':code,'name':name,'samples':samples[8:16] if len(samples)>=16 else samples[-8:]})
target=Path(__file__).resolve().parent.parent/'dist/games/data/languages.json'
with target.open('w',encoding='utf-8') as output:json.dump(result,output,ensure_ascii=False,separators=(',',':'))
print(f'{len(result)} languages; {sum(len(x["samples"]) for x in result)} samples')
