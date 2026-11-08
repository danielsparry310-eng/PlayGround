const KEY='eldoria-chronicle-v1';
export function saveGame(state){try{const clean=JSON.parse(JSON.stringify(state));localStorage.setItem(KEY,JSON.stringify(clean));return true}catch(e){console.warn('Chronicle could not be saved',e);return false}}
export function loadGame(){try{const raw=localStorage.getItem(KEY);if(!raw)return null;const data=JSON.parse(raw);if(!data||!data.character||!data.inventory||(!Array.isArray(data.inventory)&&typeof data.inventory!=='object'))return null;return data}catch(e){return null}}
export function clearSave(){localStorage.removeItem(KEY)}
export function saveExists(){return !!loadGame()}
