import {CLASSES, REGIONS, QUESTS, INTRO_LINES, ENEMIES, EQUIP_SLOTS} from './data.js';
import {World} from './world.js';
import {createPlayer, movePlayer} from './player.js';
import {Combat} from './combat.js';
import {Progression} from './progression.js';
import {Inventory} from './inventory.js';
import {saveGame, loadGame, clearSave, saveExists} from './save.js';

const $ = id => document.getElementById(id);
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const game = {player:null, world:null, combat:null, progression:null, inventory:null, ui:null, paused:false, dead:false, cls:null, quest:'intro', kills:0, huntKills:0, metMaera:false, bossSpawned:false, bossDefeated:false, selectedClass:null, keys:new Set(), pointer:{x:0,y:0}, time:0, joystick:{x:0,y:0}};

class GameUI {
  constructor(g){this.g=g;this.toastTimers=[];this.damageTexts=[];this.panel=null;this.panelRefresh=0;this.regionTimer=0;this.levelTimer=0;this.dialogueStep=0;this.onboarding=true;}
  showScreen(id){document.querySelectorAll('.screen').forEach(n=>n.classList.remove('active'));$(id)?.classList.add('active')}
  toast(text,bright=false){const node=document.createElement('div');node.className='toast'+(bright?' bright':'');node.textContent=text;$('toast-layer').append(node);setTimeout(()=>node.remove(),3000)}
  damageNumber(x,y,value,crit=false){this.damageTexts.push({x,y,text:String(value),life:.8,max:.8,crit,color:crit?'#f2c77f':'#e5ded2'})}
  lootToast(item){const node=document.createElement('div');node.className='loot-entry';node.innerHTML=`<span>${esc(item.icon||'✦')}</span> ${esc(item.name)} <b>${esc(item.rarity||'Common')}</b>`;$('loot-log').prepend(node);setTimeout(()=>node.remove(),4600);this.toast(`${item.rarity||'Common'} · ${item.name}`,item.rarity==='Legendary')}
  levelUp(){const p=this.g.player;$('lu-level').textContent=p.level;$('levelup-fx').classList.remove('hidden');clearTimeout(this.levelTimer);this.levelTimer=setTimeout(()=>$('levelup-fx').classList.add('hidden'),1800);this.renderPanel()}
  onKill(e){this.g.kills++;if(this.g.quest==='hunt'){this.g.huntKills++;if(this.g.huntKills>=6)this.g.quest='boss'}if(e.type==='boss'){this.g.bossDefeated=true;this.g.quest='done';$('boss-bar').classList.add('hidden');this.toast('The seal answers. The Cinder Warden is defeated.',true)}this.renderPanel();this.g.save?.()}
  showDeath(){this.g.paused=true;$('death-meta').textContent=`Level ${this.g.player.level} · ${this.g.player.gold} gold carried`;$('screen-death').classList.add('active')}
  bossPhase(phase){$('boss-phases').querySelectorAll('i').forEach((el,i)=>el.classList.toggle('active',i<phase))}
  renderPanel(){if(this.panel)this.openPanel(this.panel,true)}
  lootNearby(){const p=this.g.player,near=this.g.world.drops.filter(d=>Math.hypot(d.x-p.x,d.y-p.y)<105);if(!near.length){this.toast('No fragments nearby.');return}near.forEach(d=>this.g.inventory.addDrop(d))}
  interact(){const p=this.g.player,w=this.g.world;if(Math.hypot(p.x-1200,p.y-900)<105){if(!this.g.metMaera){this.g.metMaera=true;if(this.g.quest==='intro')this.g.quest='hunt';this.dialogue('Maera','Survivor of Emberfall','You woke beneath the shrine with the dead gathered around you. They are listening for something. Find what calls them, and do not let it answer.',['I will find it.']);this.g.save?.();return}this.toast('The old shrine hums beneath your hand. Your wounds ease.',true);p.hp=Math.min(p.maxHp,p.hp+35);p.resource=p.maxResource;this.g.save?.();return}if(Math.hypot(p.x-w.bossGate.x,p.y-w.bossGate.y)<145){if(this.g.quest==='boss'&&!this.g.bossSpawned){this.g.bossSpawned=true;w.spawnEnemy('boss',w.bossGate.x,w.bossGate.y-10);this.toast('The Ashen Keep opens. The Warden comes.',true);$('boss-bar').classList.remove('hidden');this.g.save?.();return}if(!this.g.bossDefeated)this.toast(this.g.huntKills<6?'The gate is sealed. The Blight must be weakened first.':'The gate stirs.');else this.toast('The seal is quiet—for now.');return}this.toast('Nothing answers here.')}
  dialogue(name,role,text,choices=[]){$('speaker-name').textContent=name;$('speaker-role').textContent=role;$('dialogue-text').textContent=text;const c=$('dialogue-choices');c.innerHTML='';choices.forEach(label=>{const b=document.createElement('button');b.textContent=label;b.onclick=()=>{$('dialogue-layer').classList.add('hidden')};c.append(b)});$('dialogue-layer').classList.remove('hidden')}
  update(dt){const g=this.g,p=g.player;if(!p)return;this.damageTexts=this.damageTexts.filter(d=>{d.life-=dt;return d.life>0});this.drawDamage();this.updateBoss();this.updateMinimap();this.updateHud();if(this.panel&&performance.now()>this.panelRefresh){this.panelRefresh=performance.now()+800;this.renderPanel()}}
  updateHud(){const g=this.g,p=g.player;if(!p)return;const cls=CLASSES.find(c=>c.id===p.classId)||CLASSES[0];$('hud-name').textContent=p.name;$('hud-class').textContent=cls.name;$('hud-level').textContent=p.level;$('xp-fill').style.width=`${clamp(p.xp/p.xpNext*100,0,100)}%`;$('xp-text').textContent=`${p.xp} / ${p.xpNext}`;$('hud-gold').textContent=p.gold;$('hud-essence').textContent=p.essence;$('health-text').textContent=Math.ceil(p.hp);$('health-liquid').style.height=`${clamp(p.hp/p.maxHp*100,0,100)}%`;$('resource-text').textContent=Math.floor(p.resource);$('resource-liquid').style.height=`${clamp(p.resource/p.maxResource*100,0,100)}%`;$('resource-caption').textContent=cls.resource;$('potion-count').textContent=p.potions;$('qt-title').textContent=QUESTS[g.quest]?.title||'—';const objs=$('qt-objectives');objs.innerHTML='';(QUESTS[g.quest]?.objectives||[]).forEach((o,i)=>{const li=document.createElement('li');li.textContent=(g.quest==='hunt'&&i===0?`${Math.min(g.huntKills,6)} / 6 · `:g.quest==='boss'&&i===0&&g.bossSpawned?'✓ · ':'')+o;objs.append(li)});$('region-banner').classList.add('show');if(this.regionTimer===0){this.regionTimer=1;setTimeout(()=>$('region-banner').classList.remove('show'),4500)}}
  updateBoss(){const e=this.g.world?.entities.find(x=>x.type==='boss'&&x.alive);if(!e)return;const d=ENEMIES.boss;$('boss-name').textContent=d.name;$('boss-sub').textContent=`Warden of the Ashen Keep · Phase ${e.phase}`;$('boss-fill').style.width=`${clamp(e.hp/e.maxHp*100,0,100)}%`}
  updateMinimap(){const canvas=$('minimap'),ctx=canvas.getContext('2d'),g=this.g,p=g.player;if(!p)return;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#171612';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='rgba(190,157,107,.26)';ctx.lineWidth=1;for(let i=1;i<5;i++){ctx.beginPath();ctx.moveTo(i*canvas.width/5,0);ctx.lineTo(i*canvas.width/5,canvas.height);ctx.moveTo(0,i*canvas.height/5);ctx.lineTo(canvas.width,i*canvas.height/5);ctx.stroke()}const pt=(x,y)=>({x:x/g.world.w*canvas.width,y:y/g.world.h*canvas.height});let s=pt(1200,900);ctx.fillStyle='#b29563';ctx.beginPath();ctx.arc(s.x,s.y,4,0,Math.PI*2);ctx.fill();let gate=pt(g.world.bossGate.x,g.world.bossGate.y);ctx.fillStyle='#a54b37';ctx.fillRect(gate.x-2,gate.y-2,5,5);g.world.entities.filter(e=>e.alive).forEach(e=>{let q=pt(e.x,e.y);ctx.fillStyle=e.type==='boss'?'#ff8b47':e.elite?'#ddb46a':'#a44b43';ctx.fillRect(q.x-1,q.y-1,2,2)});let q=pt(p.x,p.y);ctx.fillStyle='#f2e4c4';ctx.beginPath();ctx.arc(q.x,q.y,4,0,Math.PI*2);ctx.fill();$('minimap-label').textContent='EMBERFALL'}
  drawDamage(){const canvas=$('game'),ctx=canvas.getContext('2d'),cam=this.g.world?.camera;if(!cam)return;ctx.save();ctx.textAlign='center';this.damageTexts.forEach(d=>{const t=1-d.life/d.max,x=(d.x-cam.x)*cam.zoom+canvas.width/2,y=(d.y-cam.y)*cam.zoom+canvas.height/2-34-t*34;ctx.globalAlpha=clamp(d.life/.25,0,1);ctx.fillStyle=d.color;ctx.font=`${d.crit?'bold 17':'bold 13'}px Inter,Arial`;ctx.shadowColor='#000';ctx.shadowBlur=4;ctx.fillText(d.crit?`${d.text}!`:d.text,x,y)});ctx.restore()}
  openPanel(kind,refresh=false){this.panel=kind;const layer=$('panel-layer');layer.classList.remove('hidden');const title={inventory:'Inventory',skills:'Skills & Rites',map:'World Map',journal:'Journal',character:'Character'}[kind]||kind;$('panel-title').textContent=title;$('panel-eyebrow').textContent=`${this.g.player.name} · Chronicle`;$('panel-body').innerHTML=this.panelContent(kind);if(kind==='inventory')this.bindInventory();if(kind==='skills')this.bindSkills();if(kind==='character')$('btn-save-now').onclick=()=>this.g.save?.(true);if(kind==='settings')this.bindSettings();if(kind==='map')this.drawLargeMap()}
  closePanel(){this.panel=null;$('panel-layer').classList.add('hidden')}
  panelContent(kind){const g=this.g,p=g.player,cls=CLASSES.find(c=>c.id===p.classId),inv=g.inventory;if(kind==='inventory'){const equipment=EQUIP_SLOTS.map(slot=>{const it=inv.equipment[slot];return `<button class="equip-slot ${it?'equipped':''}" data-slot="${esc(slot)}"><span class="slot-label">${esc(slot)}</span><span class="slot-icon">${it?esc(it.icon||'✦'):'◇'}</span><span class="slot-item">${it?esc(it.name):'Empty'}</span></button>`}).join('');const items=inv.bag.length?inv.bag.map(it=>`<div class="item-card rarity-${esc((it.rarity||'Common').toLowerCase())}"><span class="item-icon">${esc(it.icon||'✦')}</span><div><b>${esc(it.name)}</b><small>${esc(it.rarity||'Common')} · ${esc(it.slot||'Artifact')} · Power ${it.power||0}</small><p>${esc(it.unique||'A remnant of the old world.')}</p></div><button class="btn small" data-equip="${esc(it.id)}">Equip</button></div>`).join(''):'<div class="empty-state">Your satchel is quiet. Defeat elites to find relics.</div>';return `<div class="inventory-layout"><section><h3 class="equip-title">EQUIPMENT</h3><div class="equip-grid">${equipment}</div><div class="stat-note">Equipment power <b>${p.equipmentPower||0}</b></div></section><section><h3 class="bag-title">SATCHEL · ${inv.bag.length}/24</h3><div class="inventory-grid">${items}</div></section></div>`}
    if(kind==='skills')return `<div class="skill-summary"><span class="class-emblem" style="color:${cls.color}">✦</span><div><h3>${esc(cls.name)} · ${esc(cls.resource)}</h3><p>${esc(cls.passive)}</p></div></div><div class="skill-tree">${cls.skills.map((s,i)=>`<article class="skill-card"><div class="skill-card-icon">${s[2]}</div><div class="skill-card-copy"><h3>${esc(s[0])}</h3><p>${esc(s[1])}</p><small>${i<2?'Always ready':`Unlocks at level ${[0,0,2,3,5,8][i]}`} · ${i<2?'Basic':'Cooldown skill'}</small></div><button class="btn small" data-skill="${i}">Use ${i+1}</button></article>`).join('')}</div>`;
    if(kind==='map')return `<div class="map-layout"><div class="map-card"><canvas id="large-map" width="560" height="330"></canvas><p>THE ASHEN MARCH · Current region</p><small>Waypoints reveal themselves as the seals are restored.</small></div><div class="region-list">${REGIONS.map((r,i)=>`<div class="region-card ${i===0?'unlocked':''}"><b>${esc(r.name)}</b><span>${esc(r.subtitle)}</span><small>${r.unlocked?'Available':'Unlocks at level '+r.level}</small></div>`).join('')}</div></div>`;
    if(kind==='journal')return `<div class="journal-layout"><div class="journal-current"><div class="eyebrow">CURRENT CHAPTER · ACT I</div><h3>${esc(QUESTS[g.quest]?.title||'A Crack in the Seal')}</h3><p>${esc(QUESTS[g.quest]?.desc||'')}</p><ul>${(QUESTS[g.quest]?.objectives||[]).map(o=>`<li>${esc(o)}</li>`).join('')}</ul></div><div class="lore-card"><div class="eyebrow">FIELD NOTES</div><h3>The Seven Seals</h3><p>Each kingdom bound one fragment of the thing beneath the world. The Sundering did not break the seals—it taught them to open.</p><p>Maera’s map names six regions. The seventh has been scratched away.</p></div></div>`;
    if(kind==='settings')return `<div class="settings-list"><h3>Display</h3><p>Choose how Eldoria fills your screen. Your progress is saved separately.</p><button class="btn" id="btn-fullscreen">Toggle Fullscreen</button><p class="settings-note">Sound controls are not available in this build.</p></div>`;
    if(kind==='character')return `<div class="character-sheet"><div class="character-hero"><div class="character-sigil" style="color:${cls.color}">✦</div><div><div class="eyebrow">LEVEL ${p.level} ${esc(cls.name)}</div><h3>${esc(p.name)}</h3><p>${esc(cls.tag)} · ${esc(cls.weapon)}</p></div></div><div class="stats-grid">${[['Vitality',`${Math.ceil(p.hp)} / ${p.maxHp}`],['Damage',Math.round(p.damage)],['Armor',`${Math.round(p.armor)}%`],['Critical chance',`${Math.round(p.crit*100)}%`],['Movement',`${Math.round(p.speed)}%`],['Gold',p.gold],['Essence',p.essence],['Enemies defeated',g.kills]].map(([a,b])=>`<div class="stat-card"><span>${a}</span><b>${b}</b></div>`).join('')}</div><p class="passive-note">${esc(cls.passive)}</p><button class="btn" id="btn-save-now">Save Chronicle</button></div>`;
    return ''}
  bindInventory(){document.querySelectorAll('[data-equip]').forEach(b=>b.onclick=()=>this.g.inventory.equip(b.dataset.equip));document.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>this.g.inventory.unequip(b.dataset.slot));}
  bindSkills(){document.querySelectorAll('[data-skill]').forEach(b=>b.onclick=()=>{this.closePanel();this.g.combat.useSkill(Number(b.dataset.skill))});}
  bindSettings(){$('btn-fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{this.toast('Fullscreen is unavailable in this browser.')}}}
  drawLargeMap(){const c=$('large-map');if(!c)return;const x=c.getContext('2d'),g=this.g;x.fillStyle='#171612';x.fillRect(0,0,c.width,c.height);x.strokeStyle='rgba(190,157,107,.2)';for(let i=1;i<8;i++){x.beginPath();x.moveTo(i*c.width/8,0);x.lineTo(i*c.width/8,c.height);x.stroke()}const pt=(a,b)=>({x:a/g.world.w*c.width,y:b/g.world.h*c.height});x.fillStyle='#aa8c5a';let s=pt(1200,900);x.beginPath();x.arc(s.x,s.y,7,0,Math.PI*2);x.fill();let q=pt(g.world.bossGate.x,g.world.bossGate.y);x.fillStyle='#b84e3c';x.fillRect(q.x-4,q.y-4,8,8);g.world.entities.filter(e=>e.alive).forEach(e=>{let p=pt(e.x,e.y);x.fillStyle=e.type==='boss'?'#ff8b47':'#a44b43';x.fillRect(p.x-2,p.y-2,4,4)});let p=pt(g.player.x,g.player.y);x.fillStyle='#f2e4c4';x.beginPath();x.arc(p.x,p.y,5,0,Math.PI*2);x.fill()}
}

// The menu is intentionally lightweight; a session is constructed only when a chronicle starts or loads.
const ui = game.ui = new GameUI(game);
game.mode = 'menu';
game.save = (notify=false) => {
  if (!game.player || !game.inventory) return false;
  const boss=game.world?.entities.find(e=>e.type==='boss'&&e.alive);
   const ok = saveGame({version:1,character:{classId:game.player.classId,name:game.player.name},player:{...game.player},inventory:game.inventory.serialize(),quest:game.quest,kills:game.kills,huntKills:game.huntKills,metMaera:game.metMaera,bossSpawned:game.bossSpawned,bossDefeated:game.bossDefeated,bossHp:boss?.hp,bossPhase:boss?.phase});
  if (notify) ui.toast(ok?'Chronicle saved.':'The chronicle could not be saved.');
  refreshMenu();
  return ok;
};

function refreshMenu(){
  const exists=saveExists();
  $('btn-continue').disabled=!exists;
  $('save-meta').textContent=exists?'A chronicle waits in the ash':'No chronicle recorded';
}
function showMenu(){
  game.mode='menu';game.paused=true;game.keys.clear();
  $('hud').classList.add('hidden');$('mobile-controls').classList.add('hidden');$('boss-bar').classList.add('hidden');
  $('panel-layer').classList.add('hidden');$('dialogue-layer').classList.add('hidden');$('screen-pause').classList.remove('active');$('screen-death').classList.remove('active');
  ui.showScreen('screen-main');refreshMenu();
}
function prepareGame(character, saved=null){
  const classId=CLASSES.some(c=>c.id===character?.classId)?character.classId:'warrior';
  const name=String(character?.name||'Wanderer').slice(0,16);
  game.player=createPlayer(classId,name,saved?.player||{});
  game.player.x=clamp(Number(game.player.x)||1200,40,2360);game.player.y=clamp(Number(game.player.y)||900,40,1760);
  game.cls=CLASSES.find(c=>c.id===classId);game.selectedClass=classId;
  game.quest=['intro','hunt','boss','done'].includes(saved?.quest)?saved.quest:'intro';
  game.kills=Math.max(0,Number(saved?.kills)||0);game.huntKills=Math.max(0,Number(saved?.huntKills)||0);
  game.metMaera=!!saved?.metMaera;game.bossSpawned=!!saved?.bossSpawned;game.bossDefeated=!!saved?.bossDefeated;
  if(game.bossDefeated){game.bossSpawned=true;game.quest='done'}
  game.paused=false;game.dead=false;game.keys.clear();game.joystick={x:0,y:0};
  game.world=new World(game);game.world.camera.x=game.player.x;game.world.camera.y=game.player.y;
  if(game.bossSpawned&&!game.bossDefeated){const boss=game.world.spawnEnemy('boss',game.world.bossGate.x,game.world.bossGate.y-10);if(Number.isFinite(saved?.bossHp))boss.hp=clamp(saved.bossHp,1,boss.maxHp);if(Number.isFinite(saved?.bossPhase))boss.phase=clamp(saved.bossPhase,1,3);}
  game.combat=new Combat(game);game.progression=new Progression(game);game.inventory=new Inventory(game,saved?.inventory||[]);
  game.mode='play';ui.panel=null;ui.damageTexts=[];
  $('screen-main').classList.remove('active');$('screen-select').classList.remove('active');$('screen-intro').classList.remove('active');$('screen-pause').classList.remove('active');$('screen-death').classList.remove('active');
  $('panel-layer').classList.add('hidden');$('dialogue-layer').classList.add('hidden');$('hud').classList.remove('hidden');
  $('boss-bar').classList.toggle('hidden',!game.bossSpawned||game.bossDefeated);
  $('mobile-controls').classList.toggle('hidden',!('ontouchstart'in window)||window.innerWidth>900);
  buildAbilities();ui.updateHud();ui.updateMinimap();
  if(!saved)game.save();
}
function buildAbilities(){
  const cls=game.cls, make=(container,mobile=false)=>{
    container.innerHTML='';cls.skills.forEach((s,i)=>{const b=document.createElement('button');b.className='ability-key';b.title=`${s[0]} — ${s[1]}`;b.setAttribute('aria-label',`${i+1}: ${s[0]}`);b.innerHTML=`<span>${esc(s[2])}</span><small>${i+1}</small>`;b.onclick=e=>{e.preventDefault();game.combat?.useSkill(i)};container.append(b)});
  };
  make($('abilities'));make($('mobile-abilities'),true);
}
function startNewGame(){game.selectedClass=null;$('char-name-input').value='';$('btn-enter-world').disabled=true;renderClassSelect();ui.showScreen('screen-select')}
function renderClassSelect(){
  const grid=$('class-grid');grid.innerHTML='';CLASSES.forEach(c=>{const b=document.createElement('button');b.className='class-card';b.dataset.class=c.id;b.innerHTML=`<span class="class-sigil" style="color:${esc(c.color)}">✦</span><b>${esc(c.name)}</b><small>${esc(c.tag)}</small><p>${esc(c.desc)}</p><span class="class-resource">${esc(c.resource)}</span>`;b.onclick=()=>{game.selectedClass=c.id;grid.querySelectorAll('.class-card').forEach(n=>n.classList.toggle('selected',n===b));$('btn-enter-world').disabled=false};grid.append(b)});
}
let introIndex=0;
function showIntroLine(){const line=INTRO_LINES[introIndex];$('cine-title').textContent=line.title;$('cine-body').textContent=line.text;$('btn-intro-next').textContent=introIndex===INTRO_LINES.length-1?'Enter Eldoria':'Continue';$('btn-intro-next').classList.remove('hidden')}
function enterIntro(){introIndex=0;showIntroLine();ui.showScreen('screen-intro')}
function advanceIntro(){if(introIndex<INTRO_LINES.length-1){introIndex++;showIntroLine()}else prepareGame({classId:game.selectedClass,name:$('char-name-input').value.trim()||'Wanderer'})}
function continueGame(){const saved=loadGame();if(!saved){ui.toast('No saved chronicle was found.');refreshMenu();return}prepareGame(saved.character,saved)}
function togglePause(){if(game.mode!=='play'||game.dead)return;if(game.panel){ui.closePanel();return}game.paused=!game.paused;$('screen-pause').classList.toggle('active',game.paused);if(game.paused){game.keys.clear();$('pause-meta').textContent=`${game.player.name} · Level ${game.player.level} · ${game.kills} enemies defeated`;game.save()}else $('screen-pause').classList.remove('active')}

function resizeCanvas(){const canvas=$('game');canvas.width=Math.max(1,window.innerWidth);canvas.height=Math.max(1,window.innerHeight)}
function usePotion(){const p=game.player;if(!p||game.paused||game.dead||p.potions<=0)return;if(p.hp>=p.maxHp){ui.toast('Your vitality is already full.');return}p.potions--;p.hp=Math.min(p.maxHp,p.hp+Math.round(p.maxHp*.42));ui.toast('Healing flask consumed.',true);ui.updateHud();game.save()}
function dodge(){const p=game.player;if(!p||game.paused||game.dead||p.roll>0)return;let v=movementInput();if(Math.hypot(v.x,v.y)<.1){v={x:Math.cos(p.facing),y:Math.sin(p.facing)}}const n=Math.hypot(v.x,v.y)||1;p.x=clamp(p.x+v.x/n*78,40,game.world.w-40);p.y=clamp(p.y+v.y/n*78,40,game.world.h-40);p.roll=.28;p.invuln=.55;game.world.addEffect({type:'burst',x:p.x,y:p.y,radius:34,color:'#b9a17c',life:.25})}
function movementInput(){let x=0,y=0;if(game.keys.has('a')||game.keys.has('arrowleft'))x--;if(game.keys.has('d')||game.keys.has('arrowright'))x++;if(game.keys.has('w')||game.keys.has('arrowup'))y--;if(game.keys.has('s')||game.keys.has('arrowdown'))y++;x+=game.joystick.x;y+=game.joystick.y;return {x,y}}
function setFacingFromPointer(e){if(!game.player||!game.world)return;const rect=$('game').getBoundingClientRect(),cam=game.world.camera;const wx=(e.clientX-rect.left-rect.width/2)/cam.zoom+cam.x,wy=(e.clientY-rect.top-rect.height/2)/cam.zoom+cam.y;game.player.facing=Math.atan2(wy-game.player.y,wx-game.player.x)}
function promptUpdate(){const n=$('interact-prompt'),t=$('interact-text');if(!game.player||game.mode!=='play'||game.paused||game.dead||game.panel||!$('dialogue-layer').classList.contains('hidden')){n.classList.add('hidden');return}const p=game.player,w=game.world,shrine=Math.hypot(p.x-1200,p.y-900),gate=Math.hypot(p.x-w.bossGate.x,p.y-w.bossGate.y);if(shrine<125){t.textContent=game.metMaera?'Rest at Shrine':'Speak with Maera';n.classList.remove('hidden')}else if(gate<155){t.textContent=game.bossSpawned?'Confront the Warden':'Enter the Ashen Keep';n.classList.remove('hidden')}else n.classList.add('hidden')}
function frame(now){requestAnimationFrame(frame);const canvas=$('game'),ctx=canvas.getContext('2d');const dt=Math.min(.05,Math.max(0,(now-(game.lastFrame||now))/1000));game.lastFrame=now;ctx.clearRect(0,0,canvas.width,canvas.height);if(game.mode==='play'&&game.world){if(!game.paused&&!game.dead&&!game.panel&&$('dialogue-layer').classList.contains('hidden')){movePlayer(game.player,movementInput(),dt,game.world);game.combat.update(dt);game.world.update(dt)}game.world.draw(ctx,dt);game.ui.update(dt);promptUpdate()}else{ctx.fillStyle='#100e0c';ctx.fillRect(0,0,canvas.width,canvas.height)}}

// Menu and character-flow controls.
$('btn-new').onclick=startNewGame;
$('btn-continue').onclick=continueGame;
$('btn-select-back').onclick=showMenu;
$('btn-enter-world').onclick=()=>{if(game.selectedClass)enterIntro()};
$('btn-intro-next').onclick=advanceIntro;
$('btn-skip-intro').onclick=()=>prepareGame({classId:game.selectedClass,name:$('char-name-input').value.trim()||'Wanderer'});
$('char-name-input').addEventListener('input',()=>{if(game.selectedClass)$('btn-enter-world').disabled=false});
$('btn-settings').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{ui.toast('Fullscreen is unavailable in this browser.')}};
$('btn-credits').onclick=()=>ui.toast('Eldoria · Age of Ruin — an original dark fantasy action RPG.');
$('btn-resume').onclick=()=>{game.paused=false;$('screen-pause').classList.remove('active')};
$('btn-pause-settings').onclick=()=>{ $('screen-pause').classList.remove('active');ui.openPanel('settings');game.pauseSettings=true };
$('btn-save-quit').onclick=()=>{game.save();showMenu()};
$('btn-respawn').onclick=()=>{const p=game.player;game.dead=false;game.paused=false;p.x=1200;p.y=900;p.hp=p.maxHp;p.resource=p.maxResource;p.invuln=1.5;p.potions=Math.max(1,p.potions);$('screen-death').classList.remove('active');game.save();ui.toast('You rise at the last waypoint.',true)};
$('btn-death-quit').onclick=()=>{game.save();showMenu()};
$('panel-close').onclick=()=>ui.closePanel();$('panel-backdrop').onclick=()=>ui.closePanel();
$('dialogue-layer').addEventListener('click',e=>{if(e.target.closest('.dialogue-choices')&&e.target.closest('button'))return;$('dialogue-layer').classList.add('hidden')});
$('potion-slot').onclick=usePotion;
document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>ui.openPanel(b.dataset.panel));
$('game').addEventListener('pointermove',setFacingFromPointer);
$('game').addEventListener('pointerdown',e=>{if(e.button!==0||game.mode!=='play')return;setFacingFromPointer(e);if(!game.paused&&!game.panel&&!game.dead&&$('dialogue-layer').classList.contains('hidden'))game.combat.attack()});
window.addEventListener('keydown',e=>{const key=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright','tab'].includes(key))e.preventDefault();if(game.mode!=='play'){if(key==='escape'&&$('screen-select').classList.contains('active'))showMenu();return}if(key==='escape'||key==='p'){if(game.panel){ui.closePanel();return}togglePause();return}if(game.paused||game.dead)return;if(!$('dialogue-layer').classList.contains('hidden')){if(key==='enter'||key===' ')$('dialogue-layer').classList.add('hidden');return}if(game.panel){if(key==='i'||key==='k'||key==='m'||key==='j'||key==='c')ui.closePanel();return}game.keys.add(key);if(key==='e')ui.interact();else if(key==='tab')ui.lootNearby();else if(key==='r')usePotion();else if(key===' '||key==='shift')dodge();else if(/^[1-6]$/.test(key))game.combat.useSkill(Number(key)-1);else if(key==='i')ui.openPanel('inventory');else if(key==='k')ui.openPanel('skills');else if(key==='m')ui.openPanel('map');else if(key==='j')ui.openPanel('journal');else if(key==='c')ui.openPanel('character')});
window.addEventListener('keyup',e=>game.keys.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>game.keys.clear());
window.addEventListener('resize',()=>{resizeCanvas();$('mobile-controls').classList.toggle('hidden',!('ontouchstart'in window)||window.innerWidth>900)});

// Touch joystick and ability buttons share the same combat actions as keyboard input.
const joystick=$('joystick'),stick=$('stick');let joyPointer=null;
function moveStick(e){if(joyPointer!==e.pointerId)return;const r=joystick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=r.width*.34,n=Math.hypot(dx,dy),scale=n>max?max/n:1;game.joystick={x:dx*scale/max,y:dy*scale/max};stick.style.transform=`translate(${dx*scale}px,${dy*scale}px)`}
joystick.addEventListener('pointerdown',e=>{joyPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);moveStick(e)});
joystick.addEventListener('pointermove',moveStick);
function endStick(e){if(joyPointer!==e.pointerId)return;joyPointer=null;game.joystick={x:0,y:0};stick.style.transform=''}
joystick.addEventListener('pointerup',endStick);joystick.addEventListener('pointercancel',endStick);
$('mobile-controls').addEventListener('pointerdown',e=>{const ability=e.target.closest('[data-skill]');if(ability){e.preventDefault();game.combat?.useSkill(Number(ability.dataset.skill))}});

// Keep the panel opened from pause inside the paused state, then return to the pause menu.
const originalClosePanel=ui.closePanel.bind(ui);
ui.closePanel=()=>{originalClosePanel();if(game.pauseSettings){game.pauseSettings=false;$('screen-pause').classList.add('active')}};
resizeCanvas();refreshMenu();requestAnimationFrame(frame);
