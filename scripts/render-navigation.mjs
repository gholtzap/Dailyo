import fs from 'node:fs/promises';
import path from 'node:path';

const games=[['trainrot','trainrot'],['flagrot','flags'],['langrot','languages'],['Vocabulary','vocabulary'],...['maprot','yearrot','borderrot','ladderrot','cluerot','scalerot','swaprot','skyrot','pricerot','skylinerot','zoomrot','orderrot'].map(name=>[name,name])];
async function visit(directory){
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())await visit(file);
    else if(entry.name==='index.html'){
      let html=await fs.readFile(file,'utf8');
      if(!html.includes('site-masthead'))continue;
      const route='/'+path.relative('dist',directory).split(path.sep).filter(Boolean).join('/')+'/';
      const rush=route==='//'||route.startsWith('/rush/'),daily=route==='/daily/';
      const current=games.find(([,slug])=>route===`/${slug}/`);
      const links=games.filter(game=>rush||game!==current).map(([name,slug])=>`<a href="${rush?`/rush/${name.toLowerCase()}/`:`/${slug}/`}">${name}</a>`).join('\n          ');
      const header=`<header class="site-masthead${rush||daily?' feed-header':''}${daily?' daily-header':''}">
    <a class="site-brand" href="/">dailyo</a>
    <nav class="site-modes" aria-label="Play mode">
      <a href="/daily/" aria-label="Daily mix"${daily?' aria-current="page"':''}>Daily mix</a>
      <a href="/rush/"${rush?' aria-current="page"':''}>Rush</a>
    </nav>
    ${daily?'<p id="feed-progress" role="status" tabindex="-1"></p>':''}
    <details class="site-more${rush||daily?' feed-directory':''}">
      <summary>Games</summary>
      <nav class="site-more-links" aria-label="Games">
          ${links}
          <a class="repository-link" href="https://github.com/gholtzap/Dailyo" target="_blank" rel="noopener noreferrer">GitHub repository</a>
      </nav>
    </details>
  </header>`;
      html=html.replace(/<header class="site-masthead[\s\S]*?<\/header>(?:\s*<h1 class="screen-reader-only">.*?<\/h1>)?/,header);
      if(!html.includes('src="/site.js"'))html=html.replace('</head>','  <script type="module" src="/site.js"></script>\n</head>');
      await fs.writeFile(file,html.replace(/^[ \t]+$/gm,''));
    }
  }
}
await visit('dist');
