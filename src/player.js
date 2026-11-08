export function createPlayer(classId='warrior',name='Wanderer',saved={}){
 const p={x:1200,y:900,facing:0,anim:0,attackAnim:0,roll:0,invuln:0,level:1,xp:0,xpNext:100,gold:0,essence:0,potions:3,maxHp:120,baseMaxHp:120,hp:120,maxResource:100,baseMaxResource:100,resource:100,classId,name,damage:16,baseDamage:16,speed:178,baseSpeed:178,crit:.08,baseCrit:.08,armor:0,baseArmor:0,...saved};
 p.hp=Math.min(p.hp,p.maxHp);p.resource=Math.min(p.resource,p.maxResource);return p;
}
export function movePlayer(p,input,dt,world){let dx=input.x,dy=input.y,n=Math.hypot(dx,dy);if(n>1){dx/=n;dy/=n}if(n>.08){p.x+=dx*p.speed*dt;p.y+=dy*p.speed*dt;p.facing=Math.atan2(dy,dx);p.anim+=dt}p.x=Math.max(40,Math.min(world.w-40,p.x));p.y=Math.max(40,Math.min(world.h-40,p.y));p.attackAnim=Math.max(0,p.attackAnim-dt);p.invuln=Math.max(0,p.invuln-dt);p.roll=Math.max(0,p.roll-dt);}
