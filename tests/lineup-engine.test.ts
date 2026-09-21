import{describe,expect,it}from"vitest";import{autoPickLineup,effectiveRating}from"../src/game/lineup-engine.js";
const p=(id:string,pos:string,ovr=80)=>({id,overall:ovr,primaryPosition:pos,secondaryPosition:null,fitness:100,form:50,morale:50});
describe("lineup engine",()=>{
 it("primary positionni mukofotlaydi",()=>expect(effectiveRating(p("1","LW"),"LW")).toBeGreaterThan(effectiveRating(p("1","LW"),"CB")));
 it("har playerni faqat bir slotga qo'yadi",()=>{const players=[p("g","GK"),...Array.from({length:10},(_,i)=>p(String(i),i<4?"CB":i<7?"CM":"ST"))];const a=autoPickLineup(players,[{key:"GK",position:"GK"},...Array.from({length:10},(_,i)=>({key:`S${i}`,position:i<4?"CB":i<7?"CM":"ST"}))]);expect(new Set(a.map(x=>x.clubPlayerId)).size).toBe(11);});
});
