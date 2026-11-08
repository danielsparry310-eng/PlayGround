export class Progression{
 constructor(game){this.g=game}
 checkLevel(){const p=this.g.player;let gained=0;while(p.xp>=p.xpNext&&p.level<60){p.xp-=p.xpNext;p.level++;p.xpNext=Math.round(100*Math.pow(1.16,p.level-1));p.baseMaxHp=(p.baseMaxHp||120)+12;p.hp=Math.min(p.maxHp+12,p.hp+28);p.maxResource+=2;p.baseDamage=(p.baseDamage||16)+2.4;p.baseArmor=(p.baseArmor||0)+.5;p.maxHp+=12;p.damage+=2.4;p.armor=Math.min(35,(p.armor||0)+.5);gained++}if(gained){this.g.ui.levelUp();this.g.ui.toast(`Level ${p.level} reached — your fragment grows stronger.`,true)}}
}
