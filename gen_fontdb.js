// Builds src/fontdb.gen.js from Google Fonts metadata (weights/italics that really exist).
const fs = require('fs');
const v2 = JSON.parse(fs.readFileSync('node_modules/google-font-metadata/data/google-fonts-v2.json', 'utf8'));
const byName = {};
for (const id in v2) byName[v2[id].family] = v2[id];
const L = s => s.split('|').map(x => x.trim()).filter(Boolean);
const T1 = L(`Inter|Roboto|Open Sans|Lato|Montserrat|Poppins|Noto Sans|Source Sans 3|Nunito|Raleway|Work Sans|DM Sans|Rubik|Ubuntu|PT Sans|Fira Sans|IBM Plex Sans|Barlow|Arimo|Carlito|Manrope|Mulish|Quicksand|Josefin Sans|Oswald|Bebas Neue|Anton|Roboto Condensed|Archivo Black|Fjalla One|Alfa Slab One|Abril Fatface|Bangers|Fredoka|Playfair Display|Merriweather|Lora|PT Serif|Libre Baskerville|EB Garamond|Tinos|Gelasio|Caladea|Roboto Slab|Noto Serif|Source Serif 4|Bitter|Arvo|Cinzel|Roboto Mono|Source Code Pro|JetBrains Mono|Cousine|Courier Prime|IBM Plex Mono|Inconsolata|Pacifico|Dancing Script|Caveat|Lobster|Great Vibes|Permanent Marker|Comic Neue|Indie Flower|Satisfy`);
const T2 = L(`Outfit|Plus Jakarta Sans|Figtree|Karla|Cabin|Libre Franklin|Public Sans|Lexend|Urbanist|Heebo|Titillium Web|Archivo|Varela Round|Comfortaa|Nunito Sans|Kanit|Exo 2|Oxygen|Asap|Hind|Overpass|Sora|Space Grotesk|Albert Sans|Red Hat Display|Be Vietnam Pro|Geist|Onest|Instrument Sans|Hanken Grotesk|Schibsted Grotesk|Bricolage Grotesque|Montserrat Alternates|Syne|Unbounded|Chakra Petch|Orbitron|Rajdhani|Play|Saira|Signika|Maven Pro|Dosis|Abel|Questrial|Assistant|Catamaran|Alegreya Sans|Quattrocento Sans|Barlow Condensed|League Gothic|Archivo Narrow|PT Sans Narrow|Teko|Saira Condensed|Yanone Kaffeesatz|Pathway Gothic One|Antonio|Khand|Staatliches|Righteous|Passion One|Luckiest Guy|Baloo 2|Russo One|Lilita One|Paytone One|Bungee|Squada One|Ultra|Rubik Mono One|Titan One|Chewy|Concert One|Fugaz One|Bowlby One|Shrikhand|Yeseva One|Black Ops One|Monoton|Creepster|Press Start 2P|Special Elite|Cormorant Garamond|Cormorant|Crimson Text|Crimson Pro|Zilla Slab|Domine|DM Serif Display|Spectral|Vollkorn|Old Standard TT|Libre Caslon Text|Bodoni Moda|Roboto Serif|Slabo 27px|Rokkitt|Josefin Slab|Playfair Display SC|Marcellus|Cardo|Alegreya|Neuton|Noticia Text|Quattrocento|Prata|Fraunces|Newsreader|Literata|Libre Bodoni|Sorts Mill Goudy|Gentium Book Plus|Space Mono|Fira Code|Ubuntu Mono|Share Tech Mono|VT323|Noto Sans Mono|Geist Mono|Cutive Mono|Anonymous Pro|Overpass Mono|Red Hat Mono|DM Mono|Azeret Mono|Major Mono Display|Sacramento|Kaushan Script|Shadows Into Light|Amatic SC|Patrick Hand|Courgette|Allura|Parisienne|Kalam|Gloria Hallelujah|Yellowtail|Rock Salt|Homemade Apple|Reenie Beanie|Nothing You Could Do|Covered By Your Grace|Architects Daughter|Handlee|Neucha|Mali|Sriracha|Itim|Pangolin|Schoolbell|Short Stack|Coming Soon|Gochi Hand|Just Another Hand|Cookie|Tangerine|Alex Brush|Pinyon Script|Italianno|Marck Script|Bad Script|Mr Dafoe|Leckerli One|Playball|Oleo Script|Berkshire Swash|Merienda|Niconne|Rochester|Yesteryear`);
const SC = L(`Noto Sans SC|Noto Serif SC|ZCOOL XiaoWei|ZCOOL QingKe HuangYou|ZCOOL KuaiLe|Ma Shan Zheng|Zhi Mang Xing|Liu Jian Mao Cao|Long Cang|WDXL Lubrifont SC`);
const TC = L(`Noto Sans TC|Noto Serif TC|LXGW WenKai TC|LXGW Marker Gothic|Chocolate Classical Sans|Cactus Classical Serif`);
const JP = L(`Noto Sans JP|Noto Serif JP|Zen Maru Gothic|M PLUS 1p|M PLUS Rounded 1c|Sawarabi Mincho|Kosugi Maru|Dela Gothic One|Yuji Syuku`);
const KR = L(`Noto Sans KR|Noto Serif KR|Nanum Gothic|Nanum Myeongjo|Black Han Sans`);
const cat = { 'sans-serif': 's', serif: 'r', monospace: 'm', handwriting: 'h', display: 'd' };
const rows = [], seen = new Set();
function add(list, tier, script) {
  for (const n of list) {
    const f = byName[n];
    if (!f) { console.error('MISSING', n); continue; }
    if (seen.has(n)) { console.error('DUP', n); continue; }
    seen.add(n);
    rows.push([n, cat[f.category] || 's', f.weights, f.styles.includes('italic') ? 1 : 0, tier, script]);
  }
}
add(T1, 1, ''); add(T2, 2, ''); add(SC, 1, 'sc'); add(TC, 1, 'tc'); add(JP, 1, 'jp'); add(KR, 1, 'kr');
fs.writeFileSync('src/fontdb.gen.js', '/* Google Fonts families: [name, category, weights, hasItalic, tier, script] */\nconst GF = ' + JSON.stringify(rows).replace(/\],\[/g, '],\n[') + ';\n');
console.log('families', rows.length, 'bytes', fs.statSync('src/fontdb.gen.js').size);
