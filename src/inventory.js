import {EQUIP_SLOTS} from './data.js';

export class Inventory {
  constructor(game, saved = []) {
    this.g = game;
    this.bag = Array.isArray(saved) ? saved : (saved?.bag || []);
    this.equipment = saved?.equipment || {};
    this.recalculate();
  }
  addDrop(drop) {
    if (!drop?.item) return;
    this.bag.push(drop.item);
    this.g.world.drops = this.g.world.drops.filter(d => d !== drop);
    this.g.ui?.lootToast(drop.item);
    this.g.ui?.renderPanel();
  }
  equip(itemId) {
    const index = this.bag.findIndex(item => item.id === itemId);
    if (index < 0) return;
    const item = this.bag[index];
    const slot = item.slot || 'Main hand';
    const old = this.equipment[slot];
    this.equipment[slot] = item;
    this.bag.splice(index, 1);
    if (old) this.bag.push(old);
    this.recalculate();
    this.g.ui.toast(`${item.name} equipped.`);
    this.g.ui.renderPanel();
  }
  unequip(slot) {
    if (!this.equipment[slot]) return;
    this.bag.push(this.equipment[slot]);
    delete this.equipment[slot];
    this.recalculate();
    this.g.ui.renderPanel();
  }
  recalculate() {
    const p = this.g.player;
    if (!p) return;
    const equipped = Object.values(this.equipment);
    const power = equipped.reduce((sum, item) => sum + (item.power || 0), 0);
    const weapon = equipped.filter(item => item.type === 'weapon').reduce((sum, item) => sum + (item.power || 0), 0);
    p.damage = (p.baseDamage || 16) + weapon * .55;
    p.maxHp = (p.baseMaxHp || 120) + equipped.filter(item => item.type === 'armor').reduce((sum, item) => sum + (item.power || 0) * 2, 0);
    p.armor = Math.min(45, (p.baseArmor || 0) + equipped.filter(item => item.type === 'armor').reduce((sum, item) => sum + (item.power || 0) * .55, 0));
    p.hp = Math.min(p.hp, p.maxHp);
    p.equipmentPower = power;
  }
  serialize() { return { bag: this.bag, equipment: this.equipment }; }
  slots() { return EQUIP_SLOTS; }
}
