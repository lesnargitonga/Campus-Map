const fs = require('fs');
const path = require('path');
const infile = path.resolve(__dirname, '..', 'data', 'logbook-activities.json');
const out = path.resolve(__dirname, '..', 'data', 'logbook-progress.json');

function load(){
  if(!fs.existsSync(infile)) { console.error('activities file missing:', infile); process.exit(2); }
  const raw = fs.readFileSync(infile,'utf8');
  return JSON.parse(raw);
}

function init(){
  const data = load();
  const progress = { generatedAt: new Date().toISOString(), weeks: [] };
  for(const w of (data.weeks||[])){
    const week = { title: w.title, week: w.week, days: [] };
    for(const d of (w.days||[])){
      week.days.push({ day: d.day, description: d.description, newSkills: d.newSkills, status: 'pending' });
    }
    progress.weeks.push(week);
  }
  fs.writeFileSync(out, JSON.stringify(progress, null, 2), 'utf8');
  console.log('Initialized progress at', out);
}

function list(){
  const data = load();
  console.log('Weeks:');
  data.weeks.forEach((w, i)=>{
    console.log(`${i+1}. ${w.title} (${w.week}) - ${ (w.summary||'').slice(0,80) }`);
  });
}

function exportWeek(n){
  const data = load();
  const idx = Number(n)-1; if (isNaN(idx) || idx<0 || idx>=data.weeks.length){ console.error('invalid week'); process.exit(2); }
  const w = data.weeks[idx];
  const md = [];
  md.push(`# ${w.title}`);
  if (w.summary) md.push('\n**Week summary**\n', w.summary);
  md.push('\n## Daily activities\n');
  for(const d of (w.days||[])){
    md.push(`- **${d.day}**: ${d.description} — _${d.newSkills}_`);
  }
  const outmd = path.resolve(__dirname, '..', 'data', `week-${n}-export.md`);
  fs.writeFileSync(outmd, md.join('\n'), 'utf8');
  console.log('Wrote', outmd);
}

const cmd = process.argv[2] || 'help';
if (cmd === 'init') init();
else if (cmd === 'list') list();
else if (cmd === 'export') exportWeek(process.argv[3]||'1');
else {
  console.log('Usage: node scripts/logbook-manager.js <init|list|export N>');
}
