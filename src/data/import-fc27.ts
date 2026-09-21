import { loadConfig } from "../config/env.js";
import { createDatabaseClient } from "../db/client.js";
import { Fc27OfficialProvider } from "./providers/fc27-official.provider.js";
import type { ImportedPlayer } from "./providers/player-provider.js";

const BASE_URL = "https://www.ea.com/games/ea-sports-fc/ratings";
const BATCH = 100;
const names: Record<string,string> = {
  "Man Utd":"Manchester United", "Newcastle Utd":"Newcastle United", "Nott'm Forest":"Nottingham Forest",
  "Spurs":"Tottenham Hotspur", "Brighton":"Brighton", "AFC Bournemouth":"Bournemouth",
  "Atlético de Madrid":"Atlético Madrid", "FC Barcelona":"Barcelona", "Celta":"Celta Vigo",
  "D. Alavés":"Alavés", "R. Racing Club":"Racing Club", "Valencia CF":"Valencia",
  "Sevilla FC":"Sevilla", "Villarreal CF":"Villarreal", "Ipswich":"Ipswich",
  "RCD Espanyol":"Espanyol", "CA Osasuna":"Osasuna", "Elche CF":"Elche",
  "Getafe CF":"Getafe", "Levante UD":"Levante",
};

async function get(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "user-agent": "OFM-Game/0.1 data-import" } });
  if (!response.ok) throw new Error(`EA request failed ${response.status}: ${url}`);
  return response.text();
}

async function main(): Promise<void> {
  const db = createDatabaseClient(loadConfig());
  const provider = new Fc27OfficialProvider();
  const landing = await get(BASE_URL);
  const teams = provider.competitionTeams(landing);
  if (teams.length !== 40) throw new Error(`EA team count invalid: ${teams.length}`);
  const { data: clubs, error: clubError } = await db.from("clubs").select("id,name");
  if (clubError) throw clubError;
  const clubIds = new Map((clubs ?? []).map((club) => [club.name, club.id]));
  const all: ImportedPlayer[] = [];
  for (const team of teams) {
    const target = names[team.label] ?? team.label;
    if (!clubIds.has(target)) throw new Error(`OFM club mapping topilmadi: ${team.label} -> ${target}`);
    const squad = provider.players(await get(`${BASE_URL}?team=${team.id}`));
    if (squad.length < 18 || !squad.some((player) => player.positions[0] === "GK")) throw new Error(`EA squad invalid: ${target}`);
    for (const player of squad) player.clubName = target;
    all.push(...squad);
    process.stdout.write(`${target}: ${squad.length}\n`);
  }
  const { data: source, error: sourceError } = await db.from("data_sources").select("id").eq("code",provider.code).single();
  if (sourceError) throw sourceError;
  for (let i=0;i<all.length;i+=BATCH) {
    const batch=all.slice(i,i+BATCH);
    const { data:saved,error }=await db.from("players").upsert(batch.map(p=>({
      data_source_id:source.id,source_player_id:p.sourcePlayerId,club_id:clubIds.get(p.clubName),name:p.name,
      short_name:p.shortName,age:p.age,nationality:p.nationality,primary_position:p.positions[0],
      secondary_position:p.positions[1]??null,market_value:p.marketValue,
    })),{onConflict:"data_source_id,source_player_id"}).select("id,source_player_id");
    if(error)throw error;
    const ids=new Map((saved??[]).map(row=>[row.source_player_id,row.id]));
    const {error:ae}=await db.from("player_attributes").upsert(batch.map(p=>({player_id:ids.get(p.sourcePlayerId),overall:p.overall,pace:p.pace,shooting:p.shooting,passing:p.passing,dribbling:p.dribbling,defending:p.defending,physical:p.physical})),{onConflict:"player_id"});
    if(ae)throw ae;
    const {error:pe}=await db.from("player_positions").upsert(batch.flatMap(p=>p.positions.map((position,index)=>({player_id:ids.get(p.sourcePlayerId),position,priority:index+1}))),{onConflict:"player_id,position"});
    if(pe)throw pe;
  }
  const {data:oldSource}=await db.from("data_sources").select("id").eq("code","FC26_SOFIFA").maybeSingle();
  if(oldSource){
    for(let from=0;;){
      const {data:oldPlayers,error}=await db.from("players").select("id").eq("data_source_id",oldSource.id).limit(BATCH);
      if(error)throw error;if(!oldPlayers?.length)break;
      const ids=oldPlayers.map(player=>player.id);
      const {error:ce}=await db.from("club_players").delete().in("player_id",ids);if(ce)throw ce;
      const {error:de}=await db.from("players").delete().in("id",ids);if(de)throw de;
    }
  }
  const {data:linked,error:linkError}=await db.rpc("sync_club_players");if(linkError)throw linkError;
  await db.from("data_sources").update({imported_at:new Date().toISOString()}).eq("id",source.id);
  process.stdout.write(`FC27 import complete: ${all.length} players, ${linked} links.\n`);
}
main().catch((error:unknown)=>{process.stderr.write(`${error instanceof Error?error.stack??error.message:JSON.stringify(error)}\n`);process.exitCode=1;});
