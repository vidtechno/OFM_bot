import type{MarketPlayer}from"./transfer.repository.js";
export const transferMoney=(n:number)=>`€${(n/1_000_000).toFixed(1)}M`;
export function formatMarket(players:MarketPlayer[]):string{return players.length?["GLOBAL TRANSFER MARKET","",...players.map((p,i)=>`${i+1}. ${p.name} · ${p.position} · OVR ${p.overall} · ${transferMoney(p.askingPrice)}`)].join("\n"):"GLOBAL TRANSFER MARKET\n\nHozir faol listing yo‘q.";}
export function formatListing(p:MarketPlayer):string{return["PLAYER TRANSFER", "",p.name,`${p.position} · OVR ${p.overall} · ${p.age} yosh`,`Narx: ${transferMoney(p.askingPrice)}`,"","Xarid pul va futbolchini atomik ko‘chiradi."].join("\n");}
