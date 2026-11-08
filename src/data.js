export const CLASSES=[
 {id:'warrior',name:'Warrior',tag:'Iron remembers',desc:'A bastion of steel who turns every wound into momentum. Break the line; leave nothing standing.',traits:['Vanguard','Rage','Heavy arms'],resource:'RAGE',color:'#b68155',weapon:'Ashen greatsword',passive:'Gain 4% damage reduction for each nearby enemy (up to 20%).',skills:[['Cleave','A broad, brutal arc that wounds all foes before you.','⚔','physical',0],['Shieldbreak','Drive forward and shatter an enemy’s guard.','⬡','physical',0],['Groundrend','Split the earth in a line of jagged force.','⌁','physical',2],['War Cry','Roar defiance; empower yourself and nearby allies.','◉','buff',3],['Iron Tempest','Spin through the press, striking every heartbeat.','✹','physical',5],['Last Bastion','Become unyielding; the next blow heals you.','⛨','buff',8]]},
 {id:'mage',name:'Mage',tag:'The storm has a name',desc:'A scholar of the primal elements, binding fire, frost and lightning to a will that should not exist.',traits:['Elementalist','Mana','Spellcraft'],resource:'MANA',color:'#7295bd',weapon:'Sablewood focus',passive:'Elemental spells have a 12% chance to echo at half power.',skills:[['Ember Lance','Hurl a lance of living flame at your foe.','ϟ','fire',0],['Frostbind','A burst of rime slows all nearby enemies.','❄','ice',0],['Chain Spark','Lightning leaps between up to four foes.','ϟ','lightning',2],['Prismatic Ward','Wrap yourself in a barrier of gathered light.','◇','buff',3],['Starfall','Call down three meteors in a wide area.','☄','arcane',5],['Rift Step','Blink through the veil, leaving a blast behind.','◉','arcane',8]]},
 {id:'ranger',name:'Ranger',tag:'Beyond the last road',desc:'An unerring hunter of the wild places, whose arrows find the truth hidden in darkness.',traits:['Deadeye','Focus','Fieldcraft'],resource:'FOCUS',color:'#8aa568',weapon:'Longbow of the March',passive:'Deal 15% bonus damage to enemies above 80% health.',skills:[['Quickshot','Loose a swift, precise arrow.','➶','physical',0],['Barbed Snare','Set a hidden trap that roots and bleeds.','⌘','physical',0],['Volley','Rain arrows across the marked ground.','↟','physical',2],['Trailblazer','Dash away, leaving a slowing snare.','➤','buff',3],['Piercing Bolt','A heavy shot that passes through all foes.','➶','physical',5],['Ghostwalk','Fade from sight; your next strike is critical.','◌','buff',8]]},
 {id:'necromancer',name:'Necromancer',tag:'Death keeps its promises',desc:'A keeper of forbidden rites who bargains with the departed—and pays in memories.',traits:['Soulweaver','Essence','Grave rites'],resource:'ESSENCE',color:'#9274ad',weapon:'Reliquary staff',passive:'Restore 2 essence whenever an enemy falls nearby.',skills:[['Soul Needle','Pierce the living with a shard of the beyond.','†','shadow',0],['Gravehand','Skeletal hands erupt to grasp and wound.','☠','shadow',0],['Withering Veil','Curse a target; it takes more damage briefly.','◌','shadow',2],['Boneguard','Conjure a ward from the bones of the lost.','⌖','buff',3],['Ravenous Dead','Summon a spectral hound to hunt your foe.','♞','shadow',5],['Final Testament','Spend all essence in a devastating soulburst.','✦','shadow',8]]},
 {id:'paladin',name:'Paladin',tag:'The light is not kind',desc:'A sworn protector carrying a faith that survived its gods. Mercy is a choice, not a weakness.',traits:['Oathkeeper','Resolve','Sanctity'],resource:'RESOLVE',color:'#c7a86c',weapon:'Sun-forged mace',passive:'Heal 1% maximum health every 5 seconds while above half resolve.',skills:[['Judgment','Smite an enemy with a strike of pale fire.','✦','holy',0],['Aegis Bash','Stun a foe behind a shield of dawn.','⛨','holy',0],['Consecrate','Sanctify the ground beneath your feet.','☼','holy',2],['Vow of Mercy','Restore a portion of your health.','✚','buff',3],['Radiant Chain','A holy lash arcs through nearby foes.','ϟ','holy',5],['Dawn Unbroken','Unleash a blinding wave; become invulnerable.','☼','holy',8]]},
 {id:'assassin',name:'Assassin',tag:'A quieter kind of ruin',desc:'A blade in the gap between heartbeats. Their order vanished in the Sundering; their debts did not.',traits:['Shadowstep','Combo','Venom'],resource:'COMBO',color:'#b06e69',weapon:'Twin duskblades',passive:'Critical strikes apply a stacking poison to their target.',skills:[['Twin Fang','A quick dual-blade strike.','⚔','physical',0],['Viper’s Kiss','Coat your blades in lingering venom.','♧','poison',0],['Shadowstep','Blink behind a foe and strike from concealment.','◌','shadow',2],['Caltrops','Scatter blades that slow pursuing enemies.','✣','physical',3],['Rising Silence','A flurry that ends in a critical backstab.','✧','physical',5],['Nightfall','Vanish, then strike every nearby enemy.','☾','shadow',8]]}
];
export const EQUIP_SLOTS=['Helmet','Chest','Gloves','Pants','Boots','Main hand','Off-hand','Amulet','Ring I','Ring II'];
export const REGIONS=[
 {id:'ash',name:'The Kingdom of Ash',subtitle:'Ruined villages · The fallen crown',enemy:'Hollowed',resource:'Cinderbloom',boss:'The Cinder Warden',level:1,unlocked:true},
 {id:'woods',name:'The Whispering Woods',subtitle:'Old roots · Older hungers',enemy:'Mirefang',resource:'Moonmilk',boss:'The Antlered Hunger',level:12},
 {id:'frozen',name:'The Frozen Citadel',subtitle:'Where winter keeps its dead',enemy:'Rimebound',resource:'Blue iron',boss:'The Pale Regent',level:24},
 {id:'blood',name:'The Bloodlands',subtitle:'A prayer written in red',enemy:'Red Votary',resource:'Heartglass',boss:'Saint Veyra',level:36},
 {id:'sunken',name:'The Sunken Kingdom',subtitle:'The drowned remember',enemy:'Drowned',resource:'Abyssal salt',boss:'The Choir Below',level:48},
 {id:'throne',name:'The Shattered Throne',subtitle:'The wound beneath the world',enemy:'Unmade',resource:'First ash',boss:'The Unwritten King',level:60}
];
export const ENEMIES={
 husk:{name:'Cinder Husk',kind:'undead',hp:42,speed:30,damage:8,xp:18,color:'#819080',size:15,attack:26,range:32,behavior:'melee',loot:0.28},
 hound:{name:'Ashen Hound',kind:'beast',hp:30,speed:59,damage:7,xp:16,color:'#a77c5e',size:13,attack:22,range:24,behavior:'flank',loot:0.22},
 cultist:{name:'Pale Supplicant',kind:'cultist',hp:34,speed:24,damage:9,xp:22,color:'#b7a18d',size:14,attack:10,range:200,behavior:'ranged',loot:0.3},
 elite:{name:'Blight-touched Reaver',kind:'elite',hp:188,speed:32,damage:14,xp:95,color:'#bb604e',size:21,attack:40,range:34,behavior:'elite',loot:1,elite:true},
 boss:{name:'The Cinder Warden',kind:'boss',hp:880,speed:25,damage:18,xp:580,color:'#d1774d',size:34,attack:58,range:48,behavior:'boss',loot:1,boss:true}
};
export const QUESTS={
 intro:{title:'A Voice in the Ash',objectives:['Find Warden Maera','Defeat the Cinder Husk','Reach the Emberfall shrine'],desc:'The voice called you back from a death you cannot remember. Find the woman who pulled you from the ash.'},
 hunt:{title:'The Hollow Road',objectives:['Defeat 6 Blight creatures','Find the source of the whispers'],desc:'Maera has seen the dead gather beyond the old aqueduct. Something is calling them home.'},
 boss:{title:'The Warden’s Oath',objectives:['Enter the Ashen Keep','Defeat the Cinder Warden'],desc:'The keep’s guardian has turned against the living. Maera believes the old seal can still be mended.'},
 done:{title:'A Crack in the Seal',objectives:['Speak with Maera'],desc:'The seal is not broken. It is being opened—from the other side.'}
};
export const INTRO_LINES=[
 {title:'The Night the Sky Broke',text:'Seven kingdoms raised seven seals against the dark beneath the world. For a thousand years, the seals held. Then the stars went out—one by one.'},
 {title:'Ashes of Dawn',text:'You woke beneath the ruins of a roadside shrine, a shard of impossible light beneath your skin. The dead had gathered around you. They did not attack. They were listening.'},
 {title:'A Voice Without a Name',text:'“Not yet,” whispered something behind the world. “You have not remembered what you are.” Then the voice was gone, and the dead began to move.'}
];
export const LOOT_BASE=[
 {name:'Ashbound Cleaver',slot:'Main hand',icon:'⚔',type:'weapon',power:8,unique:'Every third strike sends a cinder arc through nearby enemies.',class:'warrior'},
 {name:'Warden’s Iron',slot:'Chest',icon:'⛨',type:'armor',power:13,unique:'At low health, a pale spirit shields you once per encounter.',class:'any'},
 {name:'Ashglass Pendant',slot:'Amulet',icon:'◈',power:6,type:'jewelry',unique:'Your class resource regenerates 8% faster.',class:'any'},
 {name:'Cinderstep Boots',slot:'Boots',icon:'⌁',type:'armor',power:7,unique:'Dodging leaves a burning trail.',class:'any'},
 {name:'Oathbreaker’s Edge',slot:'Main hand',icon:'⚔',power:18,type:'weapon',unique:'Critical hits erupt after a three-strike combo.',class:'warrior'},
 {name:'Ring of the First Flame',slot:'Ring I',icon:'◉',power:9,type:'jewelry',unique:'Fire damage chains to one additional enemy.',class:'any'},
 {name:'The Empty Choir',slot:'Off-hand',icon:'♧',power:11,type:'focus',unique:'Your next skill echoes at 40% power after an elite kill.',class:'any'},
 {name:'Gravebound Hood',slot:'Helmet',icon:'☾',type:'armor',power:9,unique:'Killing a marked enemy restores 6 essence.',class:'necromancer'},
 {name:'Sablewood Mantle',slot:'Chest',icon:'✦',type:'armor',power:12,unique:'Elemental echoes have a chance to strike twice.',class:'mage'},
 {name:'Stalker’s Leathers',slot:'Chest',icon:'➶',type:'armor',power:10,unique:'Moving for 2 seconds grants 12% critical chance.',class:'ranger'},
 {name:'Duskwrit Bracers',slot:'Gloves',icon:'✧',type:'armor',power:8,unique:'Critical strikes leave a stacking venom.',class:'assassin'},
 {name:'Dawnsworn Gauntlets',slot:'Gloves',icon:'☼',type:'armor',power:8,unique:'Healing also grants a brief shield.',class:'paladin'},
 {name:'Cinderweave Leggings',slot:'Pants',icon:'⌁',type:'armor',power:9,unique:'Standing in ash increases armor by 8%.',class:'any'},
 {name:'Pilgrim’s Treads',slot:'Boots',icon:'➤',type:'armor',power:7,unique:'Dodge cooldown is reduced by 15%.',class:'any'},
 {name:'Shard of the Seventh Seal',slot:'Off-hand',icon:'◇',type:'focus',power:15,unique:'Your sixth skill costs 25% less resource.',class:'any'},
 {name:'Maera’s Keepsake',slot:'Amulet',icon:'❧',type:'jewelry',power:10,unique:'Waypoint shrines restore 20% more health.',class:'any'},
 {name:'Hollow Circlet',slot:'Helmet',icon:'◈',type:'armor',power:8,unique:'Nearby enemies suffer 6% more damage.',class:'any'},
 {name:'Warden’s Signet',slot:'Ring I',icon:'◉',type:'jewelry',power:11,unique:'Bosses take 8% increased damage from you.',class:'any'},
 {name:'Emberfall Loop',slot:'Ring II',icon:'◉',type:'jewelry',power:9,unique:'Your potion also burns nearby enemies.',class:'any'},
 {name:'The Ashen Oath',slot:'Main hand',icon:'⚔',type:'weapon',power:21,unique:'Every sixth hit calls a pillar of pale fire.',class:'any'},
 {name:'Nightroot Bow',slot:'Main hand',icon:'➶',type:'weapon',power:19,unique:'Projectiles split toward a second target.',class:'ranger'},
 {name:'Reliquary of Names',slot:'Off-hand',icon:'†',type:'focus',power:17,unique:'Fallen enemies have a chance to rise as spectral allies.',class:'necromancer'},
 {name:'Sunforged Aegis',slot:'Off-hand',icon:'⛨',type:'focus',power:16,unique:'Blocking grants 10 resolve.',class:'paladin'},
 {name:'Whisperfang',slot:'Main hand',icon:'☾',type:'weapon',power:17,unique:'Striking from behind guarantees a critical hit.',class:'assassin'}
];
export const AFFIXES=[
 {label:'of Embers',stat:'damage',value:2},
 {label:'of the Vigil',stat:'health',value:8},
 {label:'of Haste',stat:'speed',value:3},
 {label:'of Precision',stat:'crit',value:1},
 {label:'of Warding',stat:'armor',value:2},
 {label:'of the Well',stat:'resource',value:4}
];
export const STARTER_GEAR={
 warrior:[{name:'Recruit’s Oathblade',slot:'Main hand',icon:'⚔',type:'weapon',power:5,rarity:'Common',unique:'A chipped blade that still remembers its vow.'},{name:'Ashen Vanguard Plate',slot:'Chest',icon:'⛨',type:'armor',power:5,rarity:'Common',unique:'Scarred iron from the last muster.'}],
 mage:[{name:'Sablewood Focus',slot:'Main hand',icon:'ϟ',type:'weapon',power:5,rarity:'Common',unique:'The wood hums when the veil is thin.'},{name:'Ember Sigil',slot:'Amulet',icon:'◈',type:'jewelry',power:4,rarity:'Common',unique:'A coal that never cools.'}],
 ranger:[{name:'Marchland Longbow',slot:'Main hand',icon:'➶',type:'weapon',power:5,rarity:'Common',unique:'Strung with sinew and patience.'},{name:'Trailhide Jerkin',slot:'Chest',icon:'⛨',type:'armor',power:4,rarity:'Common',unique:'Smells of pine smoke and rain.'}],
 necromancer:[{name:'Reliquary Staff',slot:'Main hand',icon:'†',type:'weapon',power:5,rarity:'Common',unique:'A bone cage around a captive whisper.'},{name:'Gravebound Hood',slot:'Helmet',icon:'☾',type:'armor',power:4,rarity:'Common',unique:'The dead speak louder beneath it.'}],
 paladin:[{name:'Sun-forged Mace',slot:'Main hand',icon:'✦',type:'weapon',power:5,rarity:'Common',unique:'Its light is pale, but it does not waver.'},{name:'Oathkeeper’s Plate',slot:'Chest',icon:'⛨',type:'armor',power:5,rarity:'Common',unique:'Dented where a god once struck it.'}],
 assassin:[{name:'Twin Duskblades',slot:'Main hand',icon:'⚔',type:'weapon',power:5,rarity:'Common',unique:'Two answers to the same question.'},{name:'Nightweave Leathers',slot:'Chest',icon:'⛨',type:'armor',power:4,rarity:'Common',unique:'Quiet as a held breath.'}]
};
