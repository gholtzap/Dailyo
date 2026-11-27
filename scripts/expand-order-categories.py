"""Rebuild 40 sourced ordering categories using a local Nobel Prize API snapshot."""
import json,unicodedata,re,sys
from pathlib import Path
p=Path('dist/games/data/orderrot.json');rows=json.loads(p.read_text())[:15];added=[]
def add(identity,name,unit,source,pairs):
 seen=set();items=[]
 for i,(label,value) in enumerate(pairs):
  if value in seen:continue
  seen.add(value);items.append(dict(id=f'{identity}-{i}',name=label,value=value))
 assert len(items)>=4
 added.append(dict(id=identity,name=name,unit=unit,source=source,items=items))
planets=['Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune']
source='https://nssdc.gsfc.nasa.gov/planetary/factsheet/'
metrics=[('mass','mass','10²⁴ kg',[.330,4.87,5.97,.642,1898,568,86.8,102]),('density','mean density','kg/m³',[5429,5243,5514,3934,1326,687,1270,1638]),('gravity','equatorial gravity','m/s²',[3.7,8.9,9.8,3.7,23.1,9,8.7,11]),('escape','escape velocity','km/s',[4.3,10.4,11.2,5,59.5,35.5,21.3,23.5]),('rotation','rotation duration','hours',[1407.6,5832.5,23.9,24.6,9.9,10.7,17.2,16.1]),('solar-day','length of a solar day','hours',[4222.6,2802,24,24.7,9.9,10.7,17.2,16.1]),('orbital-period','orbital period','days',[88,224.7,365.2,687,4331,10747,30589,59800]),('orbital-speed','orbital speed','km/s',[47.4,35,29.8,24.1,13.1,9.7,6.8,5.4]),('eccentricity','orbital eccentricity','eccentricity',[.206,.007,.017,.094,.049,.052,.047,.010]),('axial-tilt','axial tilt','degrees',[.034,177.4,23.4,25.2,3.1,26.7,97.8,28.3]),('mean-temperature','mean temperature','°C',[167,464,15,-65,-110,-140,-195,-200])]
for identity,label,unit,values in metrics:add('planet-'+identity,'Planets by '+label,unit,source,list(zip(planets,values)))
source='https://www.ciaaw.org/atomic-weights.htm'
for identity,label,items in [
('light-elements','Light elements',[('Hydrogen',1),('Helium',2),('Lithium',3),('Beryllium',4),('Boron',5),('Carbon',6),('Nitrogen',7),('Oxygen',8),('Fluorine',9),('Neon',10)]),
('common-metals','Familiar metals',[('Aluminum',13),('Iron',26),('Copper',29),('Zinc',30),('Silver',47),('Tin',50),('Gold',79),('Lead',82)]),
('noble-gases','Noble gases',[('Helium',2),('Neon',10),('Argon',18),('Krypton',36),('Xenon',54),('Radon',86)]),
('halogens','Halogens',[('Fluorine',9),('Chlorine',17),('Bromine',35),('Iodine',53),('Astatine',85)]),
('alkali-metals','Alkali metals',[('Lithium',3),('Sodium',11),('Potassium',19),('Rubidium',37),('Cesium',55),('Francium',87)])]:add(identity,label+' by atomic number','atomic number',source,items)
add('pixar-films','Pixar films by original release year','year','https://www.pixar.com/feature-films',[("Toy Story",1995),("A Bug's Life",1998),("Toy Story 2",1999),("Monsters, Inc.",2001),("Finding Nemo",2003),("The Incredibles",2004),("Cars",2006),("Ratatouille",2007),("WALL-E",2008),("Up",2009)])
prizes=json.load(open(sys.argv[1]))['prizes']
norm=lambda s:''.join(c for c in unicodedata.normalize('NFKD',s.replace('ł','l').replace('Ł','L')) if not unicodedata.combining(c)).lower()
selections={
'physics':('Physics',['Rontgen','Marie Curie','Einstein','Bohr','Heisenberg','Fermi','Feynman','Higgs']),
'chemistry':('Chemistry',['Rutherford','Marie Curie','Haber','Pauling','Hodgkin','Sanger','Zewail','Goodenough']),
'medicine':('Medicine',['Pavlov','Koch','Fleming','Watson','McClintock','Tu Youyou','Blackburn','Barry Marshall']),
'peace':('Peace',['Dunant','Roosevelt','Martin Luther King','Bojaxhiu','Walesa','Mandela','Obama','Malala']),
'literature':('Literature',['Kipling','Tagore','Yeats','Hemingway','Steinbeck','Morrison','Dylan','Ishiguro']),
'economics':('Economics',['Friedman','Hayek','Sen','Krugman','Ostrom','Kahneman','Thaler','Duflo'])}
for category,(label,names) in selections.items():
 pairs=[]
 for target in names:
  matches=[]
  for prize in prizes:
   if prize['category']!=category:continue
   for person in prize.get('laureates',[]):
    fullname=(person.get('firstname','')+' '+person.get('surname','')).strip()
    if all(token in re.findall(r"[a-z]+", norm(fullname)) for token in norm(target).split()):matches.append((fullname,int(prize['year'])))
  assert matches,(category,target)
  name, year = min(matches,key=lambda x:x[1])
  if target == 'Bojaxhiu': name = 'Mother Teresa'
  if target == 'Tu Youyou': name = 'Tu Youyou'
  pairs.append((name, year))
 add('nobel-'+category,label+' Nobel laureates by award year','year','https://api.nobelprize.org/v1/prize.json',pairs)
polygons=[('Triangle',3),('Square',4),('Pentagon',5),('Hexagon',6),('Heptagon',7),('Octagon',8),('Decagon',10),('Dodecagon',12)]
add('polygon-diagonals','Convex polygons by number of diagonals','diagonals','https://mathworld.wolfram.com/PolygonDiagonal.html',[(name,n*(n-3)//2) for name,n in polygons])
add('polygon-angles','Regular polygons by interior angle','degrees','https://mathworld.wolfram.com/Polygon.html',[(name,round(180*(n-2)/n,4)) for name,n in polygons])
assert len(added)==25
rows+=added
p.write_text(json.dumps(rows,indent=2,ensure_ascii=False)+'\n')
print(len(rows),'categories;',sum(len(r['items']) for r in rows),'items')

