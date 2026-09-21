import {positionCompatibility} from "./config/position-compatibility.js";
export interface Candidate{id:string;overall:number;primaryPosition:string;secondaryPosition:string|null;fitness:number;form:number;morale:number}
export interface Slot{key:string;position:string}
export interface Assignment{slotKey:string;slotPosition:string;clubPlayerId:string;effectiveRating:number}
export function effectiveRating(player:Candidate,slot:string):number{
 const fit=.94+player.fitness/100*0.06,form=.97+player.form/100*0.06,morale=.98+player.morale/100*0.04;
 return Math.min(99,Math.max(1,Number((player.overall*positionCompatibility(player.primaryPosition,player.secondaryPosition,slot)*fit*form*morale).toFixed(2))));
}
export function autoPickLineup(players:Candidate[],slots:Slot[]):Assignment[]{
 const available=new Map(players.map(player=>[player.id,player]));const result:Assignment[]=[];
 const ordered=[...slots].sort((a,b)=>{const count=(s:Slot)=>players.filter(p=>positionCompatibility(p.primaryPosition,p.secondaryPosition,s.position)>=.86).length;return count(a)-count(b);});
 for(const slot of ordered){const best=[...available.values()].sort((a,b)=>effectiveRating(b,slot.position)-effectiveRating(a,slot.position))[0];if(!best)throw new Error("SQUAD_TOO_SMALL");available.delete(best.id);result.push({slotKey:slot.key,slotPosition:slot.position,clubPlayerId:best.id,effectiveRating:effectiveRating(best,slot.position)});}
 return slots.map(slot=>result.find(item=>item.slotKey===slot.key)!);
}
