import type { FinanceSummary, MatchOwnerReport, MatchResult, PlayerLeader, TableRow } from "./match.repository.js";

export function formatResults(results: MatchResult[]): string {
  if (!results.length) return "NATIJALAR\n\nHali o‘yin o‘tkazilmagan.";
  return ["⚽ SO‘NGGI NATIJALAR", "", ...results.map((r) => `${r.round}-tur · ${r.homeClub} ${r.homeGoals}:${r.awayGoals} ${r.awayClub}`)].join("\n");
}

export function formatTable(rows: TableRow[]): string {
  const club=(name:string)=>name.length>17?`${name.slice(0,16)}…`:name.padEnd(17," ");
  return ["🏆 TURNIR JADVALI", "", "#  Klub               O‘  G‘  D  M  TF   P", "────────────────────────────────────", ...rows.map(r=>`${String(r.position).padStart(2," ")} ${club(r.club)} ${String(r.played).padStart(2," ")}  ${String(r.wins).padStart(2," ")}  ${String(r.draws).padStart(2," ")}  ${String(r.losses).padStart(2," ")} ${String(r.goalDifference).padStart(3," ")} ${String(r.points).padStart(3," ")}`), "", "O‘: o‘yin · G‘: g‘alaba · D: durang · M: mag‘lubiyat · TF: to‘plar farqi"].join("\n");
}

export function formatLeaders(title:string,leaders:PlayerLeader[],unit:string):string{return leaders.length?[title,"",...leaders.map((leader,index)=>`${index+1}. ${leader.name} · ${leader.club}\n   ${leader.total} ${unit}`)].join("\n"):[title,"","Hali o‘yin statistikasi shakllanmagan."].join("\n");}

export function formatFinances(summary: FinanceSummary): string {
  const money=(value:number)=>`€${(value/1_000_000).toFixed(2)}M`;
  return ["💰 KLUB MOLIYASI","",`Hisobdagi mablag‘: ${money(summary.cashBalance)}`,`Transfer budjeti: ${money(summary.transferBudget)}`,"","🧾 SO‘NGGI OPERATSIYALAR",...(summary.transactions.length?summary.transactions.map((t)=>`${t.amount>=0?"+":""}${money(t.amount)} · ${t.description}`):["Hozircha moliyaviy operatsiya yo‘q."])].join("\n");
}

const reportDate=new Intl.DateTimeFormat("uz-UZ",{timeZone:"Asia/Tashkent",day:"2-digit",month:"long",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
const money=(value:number)=>`€${(value/1_000_000).toFixed(2)}M`;
export function formatMatchReport(report:MatchOwnerReport):string{const won=report.isHome?report.homeGoals>report.awayGoals:report.awayGoals>report.homeGoals,draw=report.homeGoals===report.awayGoals;const headline=won?"🟢 G‘ALABA":draw?"🟡 DURANG":"🔴 MAG‘LUBIYAT";const goals=report.goals.length?report.goals.map(goal=>`${goal.minute}' ${goal.player}${goal.assist?` (${goal.assist})`:""}`).join("\n"):"Gol bo‘lmadi.";const [homePossession,awayPossession]=report.possession,[homeShots,awayShots]=report.shots,[homeOnTarget,awayOnTarget]=report.onTarget,[homeCorners,awayCorners]=report.corners;return[`${headline} · ${report.isHome?report.club:report.opponent} ${report.homeGoals}–${report.awayGoals} ${report.isHome?report.opponent:report.club}`,"",`⚽ GOLLAR\n${goals}`,"",`📊 STATISTIKA\nNazorat ${homePossession}–${awayPossession}% · Zarbalar ${homeShots}–${awayShots} · Aniq ${homeOnTarget}–${awayOnTarget}\nBurchaklar ${homeCorners}–${awayCorners}`,"",`🏆 ${report.leagueName}\n${report.position}-o‘rin · ${report.points} ochko · ${report.wins}G‘ ${report.draws}D ${report.losses}M`, `💰 +${money(report.income)} · Balans: ${money(report.balance)}`,"",report.next?`⏭ ${report.next.home} — ${report.next.away}\n${reportDate.format(new Date(report.next.scheduledAt))}`:"⏭ Keyingi uchrashuv hali belgilanmagan."].join("\n");}
