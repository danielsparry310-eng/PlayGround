import {CLASSES, REGIONS, QUESTS, INTRO_LINES, ENEMIES, EQUIP_SLOTS, STARTER_GEAR} from './data.js';
import {World} from './world.js';
import {createPlayer, movePlayer} from './player.js';
import {Combat} from './combat.js';
import {Progression} from './progression.js';
import {Inventory} from './inventory.js';
import {saveGame, loadGame, clearSave, saveExists} from './save.js';

const $ = id => document.getElementById(id);
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const game = {player:null, world:null, combat:null, progression:null, inventory:null, ui:null, paused:false, dead:false, started:false, cls:null, quest:'intro', kills:0, questKills:0, bossSpawned:false, bossDefeated:false, selectedClass:null, keys:new Set(), pointer:{x:0,y:0}, time:0};

class GameUI {
  constructor(g){this.g=g;this.toastTimers=[];this.damageTexts=[];this.panel=null;this.panelRefresh=0;this.regionTimer=0;this.levelTimer=0;this.dialogueStep=0;this.onboarding=true;}
  showScreen(id){document.querySelectorAll('.screen').forEach(n=>n.classList.remove('active'));$(id)?.classList.add('active')}
  toast(text,bright=false){const node=document.createElement('div');node.className='toast'+(bright?' bright':'');node.textContent=text;$('toast-layer').append(node);setTimeout(()=>node.remove(),3000)}
  damageNumber(x,y,value,crit=false){this.damageTexts.push({x,y,text:String(value),life:.8,max:.8,crit,color:crit?'#f2c77f':'#e5ded2'})}
  lootToast(item){const node=document.createElement('div');node.className='loot-entry';node.innerHTML=`<span>${esc(item.icon||'✦')}</span> ${esc(item.name)} <b>${esc(item.rarity||'Common')}</b>`;$('loot-log').prepend(node);setTimeout(()=>node.remove(),4600);this.toast(`${item.rarity||'Common'} · ${item.name}`,item.rarity==='Legendary')}
  levelUp(){const p=this.g.player;$('lu-level').textContent=p.level;$('levelup-fx').classList.remove('hidden');clearTimeout(this.levelTimer);this.levelTimer=setTimeout(()=>$('levelup-fx').classList.add('hidden'),1800);this.renderPanel()}
  onKill(e){this.g.kills++;if(this.g.quest==='hunt'){this.g.questKills++;if(this.g.questKills>=6)this.g.quest='boss'}if(e.type==='boss'){this.g.bossDefeated=true;this.g.quest='done';$('boss-bar').classList.add('hidden');this.toast('The seal answers. The Cinder Warden is defeated.',true)}this.renderPanel();saveCurrent()}
  showDeath(){this.g.paused=true;$('death-meta').textContent=`Level ${this.g.player.level} · ${this.g.player.gold} gold carried`;$('screen-death').classList.add('active')}
  bossPhase(phase){$('boss-phases').querySelectorAll('i').forEach((el,i)=>el.classList.toggle('active',i<phase))}
  renderPanel(){if(this.panel)this.openPanel(this.panel,true)}
  lootNearby(){const p=this.g.player,near=this.g.world.drops.filter(d=>Math.hypot(d.x-p.x,d.y-p.y)<105);if(!near.length){this.toast('No fragments nearby.');return}near.forEach(d=>this.g.inventory.addDrop(d))}
  interact(){const p=this.g.player,w=this.g.world;if(Math.hypot(p.x-1200,p.y-900)<105){if(this.g.quest==='intro'){this.g.quest='hunt';this.g.questKills=0;this.dialogue('Maera','Survivor of Emberfall','You woke beneath the shrine with the dead gathered around you. They are listening for something. Find what calls them, and do not let it answer.',['I will find it.']);return}if(this.g.quest==='done'){this.dialogue('Maera','Survivor of Emberfall','The seal is still opening. Whatever waits below has learned to reach for us. This victory is only the first answer.',['Then we keep fighting.']);return}this.toast('The old shrine hums beneath your hand.',true);return}if(Math.hypot(p.x-w.bossGate.x,p.y-w.bossGate.y)<145){if(this.g.quest==='boss'&&!this.g.bossSpawned){this.g.bossSpawned=true;w.spawnEnemy('boss',w.bossGate.x,w.bossGate.y-10);this.toast('The Ashen Keep opens. The Warden comes.',true);$('boss-bar').classList.remove('hidden');return}if(!this.g.bossDefeated)this.toast(this.g.kills<6?'The gate is sealed. The Blight must be weakened first.':'The gate stirs.');else this.toast('The seal is quiet—for now.');return}this.toast('Nothing answers here.')}
  dialogue(name,role,text,choices=[]){$('speaker-name').textContent=name;$('speaker-role').textContent=role;$('dialogue-text').textContent=text;const c=$('dialogue-choices');c.innerHTML='';choices.forEach(label=>{const b=document.createElement('button');b.textContent=label;b.onclick=()=>{$('dialogue-layer').classList.add('hidden')};c.append(b)});$('dialogue-layer').classList.remove('hidden')}
  update(dt){const g=this.g,p=g.player;if(!p)return;this.damageTexts=this.damageTexts.filter(d=>{d.life-=dt;return d.life>0});this.drawDamage();this.updateBoss();this.updateMinimap();this.updateHud();if(this.panel&&performance.now()>this.panelRefresh){this.panelRefresh=performance.now()+800;this.renderPanel()}}
  updateHud(){const g=this.g,p=g.player;if(!p)return;const cls=CLASSES.find(c=>c.id===p.classId)||CLASSES[0];$('hud-name').textContent=p.name;$('hud-class').textContent=cls.name;$('hud-level').textContent=p.level;$('xp-fill').style.width=`${clamp(p.xp/p.xpNext*100,0,100)}%`;$('xp-text').textContent=`${p.xp} / ${p.xpNext}`;$('hud-gold').textContent=p.gold;$('hud-essence').textContent=p.essence;$('health-text').textContent=Math.ceil(p.hp);$('health-liquid').style.height=`${clamp(p.hp/p.maxHp*100,0,100)}%`;$('resource-text').textContent=Math.floor(p.resource);$('resource-liquid').style.height=`${clamp(p.resource/p.maxResource*100,0,100)}%`;$('resource-caption').textContent=cls.resource;$('potion-count').textContent=p.potions;$('qt-title').textContent=QUESTS[g.quest]?.title||'—';const objs=$('qt-objectives');objs.innerHTML='';(QUESTS[g.quest]?.objectives||[]).forEach((o,i)=>{const li=document.createElement('li');li.textContent=(g.quest==='hunt'&&i===0?`${Math.min(g.questKills,6)} / 6 · `:g.quest==='boss'&&i===0&&g.bossSpawned?'✓ · ':'')+o;objs.append(li)});$('region-banner').classList.add('show');if(this.regionTimer===0){this.regionTimer=1;setTimeout(()=>$('region-banner').classList.remove('show'),4500)}}
  updateBoss(){const e=this.g.world?.entities.find(x=>x.type==='boss'&&x.alive);if(!e)return;const d=ENEMIES.boss;$('boss-name').textContent=d.name;$('boss-sub').textContent=`Warden of the Ashen Keep · Phase ${e.phase}`;$('boss-fill').style.width=`${clamp(e.hp/e.maxHp*100,0,100)}%`}
  updateMinimap(){const canvas=$('minimap'),ctx=canvas.getContext('2d'),g=this.g,p=g.player;if(!p)return;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#171612';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='rgba(190,157,107,.26)';ctx.lineWidth=1;for(let i=1;i<5;i++){ctx.beginPath();ctx.moveTo(i*canvas.width/5,0);ctx.lineTo(i*canvas.width/5,canvas.height);ctx.moveTo(0,i*canvas.height/5);ctx.lineTo(canvas.width,i*canvas.height/5);ctx.stroke()}const pt=(x,y)=>({x:x/g.world.w*canvas.width,y:y/g.world.h*canvas.height});let s=pt(1200,900);ctx.fillStyle='#b29563';ctx.beginPath();ctx.arc(s.x,s.y,4,0,Math.PI*2);ctx.fill();let gate=pt(g.world.bossGate.x,g.world.bossGate.y);ctx.fillStyle='#a54b37';ctx.fillRect(gate.x-2,gate.y-2,5,5);g.world.entities.filter(e=>e.alive).forEach(e=>{let q=pt(e.x,e.y);ctx.fillStyle=e.type==='boss'?'#ff8b47':e.elite?'#ddb46a':'#a44b43';ctx.fillRect(q.x-1,q.y-1,2,2)});let q=pt(p.x,p.y);ctx.fillStyle='#f2e4c4';ctx.beginPath();ctx.arc(q.x,q.y,4,0,Math.PI*2);ctx.fill();$('minimap-label').textContent='EMBERFALL'}
  drawDamage(){const canvas=$('game'),ctx=canvas.getContext('2d'),cam=this.g.world?.camera;if(!cam)return;ctx.save();ctx.textAlign='center';this.damageTexts.forEach(d=>{const t=1-d.life/d.max,x=(d.x-cam.x)*cam.zoom+canvas.width/2,y=(d.y-cam.y)*cam.zoom+canvas.height/2-34-t*34;ctx.globalAlpha=clamp(d.life/.25,0,1);ctx.fillStyle=d.color;ctx.font=`${d.crit?'bold 17':'bold 13'}px Inter,Arial`;ctx.shadowColor='#000';ctx.shadowBlur=4;ctx.fillText(d.crit?`${d.text}!`:d.text,x,y)});ctx.restore()}
  openPanel(kind,refresh=false){this.panel=kind;const layer=$('panel-layer');layer.classList.remove('hidden');const title={inventory:'Inventory',skills:'Skills & Rites',map:'World Map',journal:'Journal',character:'Character'}[kind]||kind;$('panel-title').textContent=title;$('panel-eyebrow').textContent=`${this.g.player.name} · Chronicle`;$('panel-body').innerHTML=this.panelContent(kind);if(kind==='inventory')this.bindInventory();if(kind==='skills')this.bindSkills();$('btn-save-now')?.addEventListener('click',()=>{saveCurrent();this.toast('Chronicle saved.',true)});if(kind==='map')this.drawLargeMap()}
  closePanel(){this.panel=null;$('panel-layer').classList.add('hidden')}
  panelContent(kind){const g=this.g,p=g.player,cls=CLASSES.find(c=>c.id===p.classId),inv=g.inventory;if(kind==='inventory'){const equipment=EQUIP_SLOTS.map(slot=>{const it=inv.equipment[slot];return `<button class="equip-slot ${it?'equipped':''}" data-slot="${esc(slot)}"><span class="slot-label">${esc(slot)}</span><span class="slot-icon">${it?esc(it.icon||'✦'):'◇'}</span><span class="slot-item">${it?esc(it.name):'Empty'}</span></button>`}).join('');const items=inv.bag.length?inv.bag.map(it=>`<div class="item-card rarity-${esc((it.rarity||'Common').toLowerCase())}"><span class="item-icon">${esc(it.icon||'✦')}</span><div><b>${esc(it.name)}</b><small>${esc(it.rarity||'Common')} · ${esc(it.slot||'Artifact')} · Power ${it.power||0}</small><p>${esc(it.unique||'A remnant of the old world.')}</p></div><button class="btn small" data-equip="${esc(it.id)}">Equip</button></div>`).join(''):'<div class="empty-state">Your satchel is quiet. Defeat elites to find relics.</div>';return `<div class="inventory-layout"><section><h3 class="equip-title">EQUIPMENT</h3><div class="equip-grid">${equipment}</div><div class="stat-note">Equipment power <b>${p.equipmentPower||0}</b></div></section><section><h3 class="bag-title">SATCHEL · ${inv.bag.length}/24</h3><div class="inventory-grid">${items}</div></section></div>`}
    if(kind==='skills')return `<div class="skill-summary"><span class="class-emblem" style="color:${cls.color}">✦</span><div><h3>${esc(cls.name)} · ${esc(cls.resource)}</h3><p>${esc(cls.passive)}</p></div></div><div class="skill-tree">${cls.skills.map((s,i)=>`<article class="skill-card"><div class="skill-card-icon">${s[2]}</div><div class="skill-card-copy"><h3>${esc(s[0])}</h3><p>${esc(s[1])}</p><small>${i<2?'Always ready':`Unlocks at level ${[0,0,2,3,5,8][i]}`} · ${i<2?'Basic':'Cooldown skill'}</small></div><button class="btn small" data-skill="${i}">Use ${i+1}</button></article>`).join('')}</div>`;
    if(kind==='map')return `<div class="map-layout"><div class="map-card"><canvas id="large-map" width="560" height="330"></canvas><p>THE ASHEN MARCH · Current region</p><small>Waypoints reveal themselves as the seals are restored.</small></div><div class="region-list">${REGIONS.map((r,i)=>`<div class="region-card ${i===0?'unlocked':''}"><b>${esc(r.name)}</b><span>${esc(r.subtitle)}</span><small>${r.unlocked?'Available':'Unlocks at level '+r.level}</small></div>`).join('')}</div></div>`;
    if(kind==='journal')return `<div class="journal-layout"><div class="journal-current"><div class="eyebrow">CURRENT CHAPTER · ACT I</div><h3>${esc(QUESTS[g.quest]?.title||'A Crack in the Seal')}</h3><p>${esc(QUESTS[g.quest]?.desc||'')}</p><ul>${(QUESTS[g.quest]?.objectives||[]).map(o=>`<li>${esc(o)}</li>`).join('')}</ul></div><div class="lore-card"><div class="eyebrow">FIELD NOTES</div><h3>The Seven Seals</h3><p>Each kingdom bound one fragment of the thing beneath the world. The Sundering did not break the seals—it taught them to open.</p><p>Maera’s map names six regions. The seventh has been scratched away.</p></div></div>`;
    if(kind==='character')return `<div class="character-sheet"><div class="character-hero"><div class="character-sigil" style="color:${cls.color}">✦</div><div><div class="eyebrow">LEVEL ${p.level} ${esc(cls.name)}</div><h3>${esc(p.name)}</h3><p>${esc(cls.tag)} · ${esc(cls.weapon)}</p></div></div><div class="stats-grid">${[['Vitality',`${Math.ceil(p.hp)} / ${p.maxHp}`],['Damage',Math.round(p.damage)],['Armor',`${Math.round(p.armor)}%`],['Critical chance',`${Math.round(p.crit*100)}%`],['Movement',`${Math.round(p.speed)}%`],['Gold',p.gold],['Essence',p.essence],['Enemies defeated',g.kills]].map(([a,b])=>`<div class="stat-card"><span>${a}</span><b>${b}</b></div>`).join('')}</div><p class="passive-note">${esc(cls.passive)}</p><button class="btn" id="btn-save-now">Save Chronicle</button></div>`;
    return ''}
  bindInventory(){document.querySelectorAll('[data-equip]').forEach(b=>b.onclick=()=>this.g.inventory.equip(b.dataset.equip));document.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>this.g.inventory.unequip(b.dataset.slot));}
  bindSkills(){document.querySelectorAll('[data-skill]').forEach(b=>b.onclick=()=>{this.closePanel();this.g.combat.useSkill(Number(b.dataset.skill))});}
  drawLargeMap(){const canvas=$('large-map');if(!canvas||!this.g.world)return;const ctx=canvas.getContext('2d'),g=this.g;ctx.fillStyle='#171612';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='rgba(190,157,107,.2)';for(let i=1;i<8;i++){ctx.beginPath();ctx.moveTo(i*canvas.width/8,0);ctx.lineTo(i*canvas.width/8,canvas.height);ctx.stroke()}ctx.fillStyle='#b29563';ctx.beginPath();ctx.arc(1200/g.world.w*canvas.width,900/g.world.h*canvas.height,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#a54b37';ctx.fillRect(g.world.bossGate.x/g.world.w*canvas.width-4,g.world.bossGate.y/g.world.h*canvas.height-4,9,9);g.world.entities.filter(e=>e.alive).forEach(e=>{ctx.fillStyle=e.type==='boss'?'#ff8b47':'#a44b43';ctx.fillRect(e.x/g.world.w*canvas.width-2,e.y/g.world.h*canvas.height-2,4,4)});ctx.fillStyle='#f2e4c4';ctx.beginPath();ctx.arc(g.player.x/g.world.w*canvas.width,g.player.y/g.world.h*canvas.height,5,0,Math.PI*2);ctx.fill()}
}

function saveCurrent(){
  if(!game.player||!game.inventory)return false;
  const state={character:game.player,inventory:game.inventory.serialize(),quest:game.quest,kills:game.kills,questKills:game.questKills,bossSpawned:game.bossSpawned,bossDefeated:game.bossDefeated,world:{entities:game.world.entities,drops:game.world.drops}};
  const ok=saveGame(state);if(ok&&game.ui)game.ui.toast('Chronicle saved.',true);return ok;
}

function startGame(saved=null){
  const data=saved||{};
  const character=data.character||{};
  const classId=CLASSES.some(c=>c.id===character.classId)?character.classId:game.selectedClass||'warrior';
  const classData=CLASSES.find(c=>c.id===classId)||CLASSES[0];
  game.player=createPlayer(classId,character.name||$('char-name-input').value.trim()||'Wanderer',character);
  game.cls=classData;game.quest=QUESTS[data.quest]?data.quest:'intro';game.kills=Math.max(0,Number(data.kills)||0);game.questKills=Math.max(0,Number(data.questKills)||0);game.bossSpawned=!!data.bossSpawned;game.bossDefeated=!!data.bossDefeated;
  game.paused=false;game.dead=false;game.started=true;
  game.world=new World(game);
  if(Array.isArray(data.world?.entities))game.world.entities=data.world.entities;
  if(Array.isArray(data.world?.drops))game.world.drops=data.world.drops;
  if(game.bossSpawned&&!game.bossDefeated&&!game.world.entities.some(e=>e.type==='boss'&&e.alive))game.world.spawnEnemy('boss',game.world.bossGate.x,game.world.bossGate.y-10);
  game.combat=new Combat(game);game.progression=new Progression(game);game.ui=new GameUI(game);game.inventory=new Inventory(game,data.inventory||STARTER_GEAR[classId].map(item=>({...item,id:Math.random().toString(36).slice(2)})));
  if(!data.character){game.player.x=1200;game.player.y=1045;}else{game.player.x=clamp(Number(game.player.x)||1200,40,game.world.w-40);game.player.y=clamp(Number(game.player.y)||900,40,game.world.h-40);}
  const canvas=$('game'),dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));canvas.width=Math.floor(innerWidth*dpr);canvas.height=Math.floor(innerHeight*dpr);game.world.camera.zoom=dpr;
  $('hud').classList.remove('hidden');$('mobile-controls').classList.toggle('hidden',!('ontouchstart'in window||navigator.maxTouchPoints>0));$('boss-bar').classList.toggle('hidden',!game.bossSpawned||game.bossDefeated);
  buildAbilities();game.ui.showScreen('');game.ui.updateHud();game.ui.toast(data.character?`Welcome back, ${game.player.name}.`:'The ash stirs around you. Find Warden Maera.',true);
  if(!data.character)saveCurrent();
}

function buildClassSelect(){
  const grid=$('class-grid');grid.innerHTML='';
  CLASSES.forEach(cls=>{const card=document.createElement('button');card.type='button';card.className='class-card';card.dataset.class=cls.id;card.innerHTML=`<div class="class-art"><canvas aria-hidden="true"></canvas></div><div class="class-name">${esc(cls.name)}</div><div class="class-tagline">${esc(cls.tag)}</div><p class="class-desc">${esc(cls.desc)}</p><div class="class-traits">${cls.traits.map(t=>`<span>${esc(t)}</span>`).join('')}</div>`;card.addEventListener('click',()=>{game.selectedClass=cls.id;grid.querySelectorAll('.class-card').forEach(n=>n.classList.toggle('selected',n===card));$('btn-enter-world').disabled=false});grid.append(card)});
}

function buildAbilities(){
  const p=game.player,cls=CLASSES.find(c=>c.id===p.classId)||CLASSES[0],root=$('abilities');root.innerHTML='';$('mobile-abilities').innerHTML='';
  cls.skills.forEach((skill,i)=>{
    const make=(mobile=false)=>{const b=document.createElement('button');b.type='button';b.className='ability-slot';b.dataset.ability=i;b.title=`${skill[0]} (${i+1})`;b.innerHTML=`<span class="ability-icon">${esc(skill[2])}</span><span class="ability-key">${i+1}</span><span class="ability-name">${esc(skill[0])}</span><span class="cooldown"></span>`;b.addEventListener('click',e=>{e.stopPropagation();game.combat?.useSkill(i)});return b};root.append(make());$('mobile-abilities').append(make(true));
  });
}

function setPaused(value){
  if(!game.started||game.dead)return;
  game.paused=!!value;
  if(game.paused){$('pause-meta').textContent=`${game.player.name} · Level ${game.player.level} · ${game.player.gold} gold`;game.ui.showScreen('screen-pause')}
  else game.ui.showScreen('');
}

function usePotion(){const p=game.player;if(!p||game.paused||game.dead)return;if(p.potions<=0){game.ui.toast('No healing flasks remain.');return}if(p.hp>=p.maxHp){game.ui.toast('Your vitality is already full.');return}p.potions--;const healed=Math.min(p.maxHp-p.hp,Math.ceil(p.maxHp*.38));p.hp+=healed;game.ui.toast(`Healing flask · restored ${healed} vitality.`,true)}
function dodge(){const p=game.player;if(!p||game.paused||game.dead||p.roll>0)return;let x=(game.keys.has('d')?1:0)-(game.keys.has('a')?1:0),y=(game.keys.has('s')?1:0)-(game.keys.has('w')?1:0);if(!x&&!y){x=Math.cos(p.facing);y=Math.sin(p.facing)}const n=Math.hypot(x,y)||1;p.x=clamp(p.x+x/n*125,40,game.world.w-40);p.y=clamp(p.y+y/n*125,40,game.world.h-40);p.facing=Math.atan2(y,x);p.roll=.35;p.invuln=.45;game.world.addEffect({type:'burst',x:p.x,y:p.y,radius:36,color:'#b9a17c',life:.32})}

function bindEvents(){
  $('btn-new').addEventListener('click',()=>{game.selectedClass=null;$('btn-enter-world').disabled=true;buildClassSelect();game.ui.showScreen('screen-select')});
  $('btn-continue').addEventListener('click',()=>{const data=loadGame();if(data)startGame(data);else game.ui.toast('No chronicle to continue.')});
  $('btn-select-back').addEventListener('click',()=>game.ui.showScreen('screen-main'));
  $('btn-enter-world').addEventListener('click',()=>{if(!game.selectedClass)return;clearSave();game.quest='intro';game.kills=0;game.questKills=0;game.bossSpawned=false;game.bossDefeated=false;game.ui.dialogueStep=0;game.ui.showScreen('screen-intro');showIntro(0)});
  $('btn-skip-intro').addEventListener('click',()=>startGame());
  $('btn-intro-next').addEventListener('click',()=>{const next=game.ui.dialogueStep+1;if(next>=INTRO_LINES.length)startGame();else showIntro(next)});
  $('btn-resume').addEventListener('click',()=>setPaused(false));
  $('btn-save-quit').addEventListener('click',()=>{saveCurrent();game.paused=false;game.started=false;game.ui.showScreen('screen-main');$('hud').classList.add('hidden');$('mobile-controls').classList.add('hidden');refreshMenu()});
  $('btn-respawn').addEventListener('click',()=>{game.dead=false;game.paused=false;game.player.hp=Math.max(1,Math.ceil(game.player.maxHp*.65));game.player.resource=game.player.maxResource;game.player.x=game.world.waypoint.x;game.player.y=game.world.waypoint.y+80;game.player.invuln=2;game.combat.cooldowns.fill(0);game.ui.showScreen('');$('boss-bar').classList.toggle('hidden',!game.bossSpawned||game.bossDefeated);saveCurrent()});
  $('btn-death-quit').addEventListener('click',()=>{clearSave();game.dead=false;game.started=false;game.ui.showScreen('screen-main');$('hud').classList.add('hidden');refreshMenu()});
  $('btn-settings').addEventListener('click',()=>game.ui.toast('Settings: use the sound and display controls in your browser.'));
  $('btn-pause-settings').addEventListener('click',()=>game.ui.toast('Settings: use the sound and display controls in your browser.'));
  $('btn-credits').addEventListener('click',()=>game.ui.dialogue('Eldoria · Age of Ruin','A dark-fantasy action RPG','An original tale of broken seals, stubborn survivors, and the things that wait beneath the world.',['Return']));
  $('panel-close').addEventListener('click',()=>game.ui.closePanel());$('panel-backdrop').addEventListener('click',()=>game.ui.closePanel());
  document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>{if(game.started&&!game.paused)game.ui.openPanel(b.dataset.panel)}));
  $('potion-slot').addEventListener('click',usePotion);
  $('game').addEventListener('pointerdown',e=>{if(!game.started||game.paused||game.dead||e.button!==0)return;game.combat.attack()});
  $('game').addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('keydown',e=>{
    if(e.repeat)return;const key=e.key.toLowerCase();
    if(key==='escape'){if(! $('panel-layer').classList.contains('hidden'))game.ui.closePanel();else if(!$('dialogue-layer').classList.contains('hidden'))$('dialogue-layer').classList.add('hidden');else if(game.started)setPaused(!game.paused);return}
    if(!game.started)return;
    if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(key))e.preventDefault();
    if(game.paused||game.dead){if(key==='enter'&&game.paused)setPaused(false);return}
    if(key===' ')dodge();else if(key==='e')game.ui.interact();else if(key==='tab'){e.preventDefault();game.ui.lootNearby()}else if(key==='r')usePotion();else if(key==='i')game.ui.openPanel('inventory');else if(key==='k')game.ui.openPanel('skills');else if(key==='m')game.ui.openPanel('map');else if(key==='j')game.ui.openPanel('journal');else if(key==='c')game.ui.openPanel('character');else if(key==='escape')setPaused(true);else if(/^[1-6]$/.test(key))game.combat.useSkill(Number(key)-1);
    if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key))game.keys.add(key);
  });
  document.addEventListener('keyup',e=>game.keys.delete(e.key.toLowerCase()));
  document.querySelectorAll('#dialogue-layer').forEach(el=>el.addEventListener('click',e=>{if(e.target===el)$('dialogue-layer').classList.add('hidden')}));
  const stick=$('stick'),joy=$('joystick');let joyId=null;
  joy.addEventListener('pointerdown',e=>{joyId=e.pointerId;joy.setPointerCapture(joyId);moveStick(e)});
  joy.addEventListener('pointermove',e=>{if(e.pointerId===joyId)moveStick(e)});
  const release=e=>{if(e.pointerId!==joyId)return;joyId=null;game.touchMove={x:0,y:0};stick.style.transform='translate(-50%,-50%)'};
  joy.addEventListener('pointerup',release);joy.addEventListener('pointercancel',release);
  function moveStick(e){const r=joy.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),max=r.width*.36,n=Math.hypot(dx,dy),scale=n>max?max/n:1;game.touchMove={x:dx*scale/max,y:dy*scale/max};stick.style.transform=`translate(calc(-50% + ${dx*scale}px),calc(-50% + ${dy*scale}px))`}
  window.addEventListener('resize',resizeCanvas);
}

function showIntro(index){const line=INTRO_LINES[index];$('cine-title').textContent=line.title;$('cine-body').textContent=line.text;game.ui.dialogueStep=index;$('btn-intro-next').classList.toggle('hidden',index<INTRO_LINES.length-1);$('btn-intro-next').textContent=index===INTRO_LINES.length-1?'Enter Eldoria':'Continue'}
function refreshMenu(){const exists=saveExists();$('btn-continue').disabled=!exists;$('save-meta').textContent=exists?`Chronicle recorded · ${loadGame()?.character?.name||'Wanderer'}`:'No chronicle recorded'}
function resizeCanvas(){const canvas=$('game'),dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));canvas.width=Math.floor(innerWidth*dpr);canvas.height=Math.floor(innerHeight*dpr);if(game.world)game.world.camera.zoom=dpr}

function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,Math.max(0,(now-(game.lastFrame||now))/1000));game.lastFrame=now;if(!game.started||!game.player||!game.world){return}if(!game.paused&&!game.dead){const keys=game.keys,m=game.touchMove||{x:0,y:0},x=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+m.x,y=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+m.y;movePlayer(game.player,{x,y},dt,game.world);game.combat.update(dt);game.world.update(dt);game.ui.update(dt);const prompt=$('interact-prompt'),p=game.player,shrine=Math.hypot(p.x-1200,p.y-900)<125,gate=Math.hypot(p.x-game.world.bossGate.x,p.y-game.world.bossGate.y)<155;if(shrine||gate){prompt.classList.remove('hidden');$('interact-text').textContent=shrine?'Speak with Maera':game.quest==='boss'?'Enter the Ashen Keep':'Examine the Ashen Keep'}else prompt.classList.add('hidden');game.autosaveTimer=(game.autosaveTimer||0)+dt;if(game.autosaveTimer>=20){game.autosaveTimer=0;saveCurrent()}}if($('abilities').children.length&&game.combat){$('abilities').querySelectorAll('[data-ability]').forEach(b=>{const i=Number(b.dataset.ability),cd=game.combat.cooldowns[i];b.classList.toggle('cooling',cd>0);b.querySelector('.cooldown').textContent=cd>0?cd.toFixed(1):''});$('mobile-abilities').querySelectorAll('[data-ability]').forEach(b=>{const i=Number(b.dataset.ability),cd=game.combat.cooldowns[i];b.classList.toggle('cooling',cd>0);b.querySelector('.cooldown').textContent=cd>0?cd.toFixed(1):''})}const canvas=$('game'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);game.world.draw(ctx,dt);}

const boot={player:null,world:null,combat:null,progression:null,inventory:null,ui:null,paused:false,dead:false,started:false,cls:null,quest:'intro',kills:0,questKills:0,bossSpawned:false,bossDefeated:false,selectedClass:null,keys:new Set(),pointer:{x:0,y:0},time:0,touchMove:{x:0,y:0},lastFrame:0};
Object.assign(game,{touchMove:{x:0,y:0},lastFrame:0});
const canvas=$('game');canvas.width=innerWidth;canvas.height=innerHeight;
game.ui=new GameUI(game);buildClassSelect();bindEvents();refreshMenu();requestAnimationFrame(frame);

