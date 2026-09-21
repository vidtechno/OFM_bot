import type { SupabaseClient } from "@supabase/supabase-js";
import type { SquadRepository } from "../squads/squad.repository.js";
import { autoPickLineup, effectiveRating } from "../game/lineup-engine.js";

export interface Formation { id:string; code:string; name:string; slots:Array<{key:string;position:string}> }
export interface Tactic { formationCode:string;formationName:string;mentality:string;pressing:number;tempo:number;defensiveLine:number;width:number;passingStyle:string;attackFocus:string;tackling:string }
export interface LineupEntry { clubPlayerId:string;slotKey:string;slotPosition:string;shortName:string;overall:number;effectiveRating:number }
const one=<T>(value:T|T[]):T=>Array.isArray(value)?value[0] as T:value;

let globalFormationsCache: { data: Formation[]; expiresAt: number } | null = null;

export class TacticsRepository {
  constructor(private readonly db:SupabaseClient,private readonly squads:SquadRepository){}

  async listFormations(forceRefresh = false): Promise<Formation[]> {
    if (!forceRefresh && globalFormationsCache && Date.now() < globalFormationsCache.expiresAt) {
      return globalFormationsCache.data;
    }
    const { data, error } = await this.db.from("formations").select("id,code,name,slots").order("name");
    if (error) throw error;
    const formations = data as Formation[];
    globalFormationsCache = { data: formations, expiresAt: Date.now() + 300_000 };
    return formations;
  }

  async get(userId:string,clubId:string):Promise<Tactic>{const{data,error}=await this.db.from("tactics").select("mentality,pressing,tempo,defensive_line,width,passing_style,attack_focus,tackling,formations!inner(code,name),league_clubs!inner(manager_user_id)").eq("league_club_id",clubId).eq("league_clubs.manager_user_id",userId).single();if(error)throw error;const formation=one<any>(data.formations);return{formationCode:formation.code,formationName:formation.name,mentality:data.mentality,pressing:data.pressing,tempo:data.tempo,defensiveLine:data.defensive_line,width:data.width,passingStyle:data.passing_style,attackFocus:data.attack_focus,tackling:data.tackling};}

  async update(userId:string,clubId:string,patch:Partial<Omit<Tactic,"formationCode"|"formationName">>):Promise<Tactic>{
    const row:any={};
    if(patch.mentality!==undefined)row.mentality=patch.mentality;
    if(patch.pressing!==undefined)row.pressing=patch.pressing;
    if(patch.tempo!==undefined)row.tempo=patch.tempo;
    if(patch.defensiveLine!==undefined)row.defensive_line=patch.defensiveLine;
    if(patch.width!==undefined)row.width=patch.width;
    if(patch.passingStyle!==undefined)row.passing_style=patch.passingStyle;
    if(patch.attackFocus!==undefined)row.attack_focus=patch.attackFocus;
    if(patch.tackling!==undefined)row.tackling=patch.tackling;
    const { data, error } = await this.db.from("tactics")
      .update(row)
      .eq("league_club_id",clubId)
      .select("mentality,pressing,tempo,defensive_line,width,passing_style,attack_focus,tackling,formations!inner(code,name),league_clubs!inner(manager_user_id)")
      .eq("league_clubs.manager_user_id",userId)
      .single();
    if(error)throw error;
    const formation=one<any>(data.formations);
    return{formationCode:formation.code,formationName:formation.name,mentality:data.mentality,pressing:data.pressing,tempo:data.tempo,defensiveLine:data.defensive_line,width:data.width,passingStyle:data.passing_style,attackFocus:data.attack_focus,tackling:data.tackling};
  }
  private async save(userId:string,clubId:string,code:string,assignments:unknown[]):Promise<void>{const{error}=await this.db.rpc("save_lineup",{p_user_id:userId,p_league_club_id:clubId,p_formation_code:code,p_assignments:assignments});if(error)throw error;}
  async autoSave(userId:string,clubId:string,code:string):Promise<void>{const formation=(await this.listFormations()).find(item=>item.code===code);if(!formation)throw new Error("FORMATION_NOT_FOUND");const players=await this.squads.listOwnedClubSquad(userId,clubId);const assignments=autoPickLineup(players.map(p=>({id:p.clubPlayerId,overall:p.overall,primaryPosition:p.primaryPosition,secondaryPosition:p.secondaryPosition,fitness:p.fitness,form:p.form,morale:p.morale})),formation.slots).map(a=>({slot_key:a.slotKey,slot_position:a.slotPosition,club_player_id:a.clubPlayerId,effective_rating:a.effectiveRating}));await this.save(userId,clubId,code,assignments);}
  async saveManual(userId:string,clubId:string,code:string,picks:Array<{slotKey:string;clubPlayerId:string}>):Promise<void>{const formation=(await this.listFormations()).find(item=>item.code===code);if(!formation||picks.length!==11||new Set(picks.map(p=>p.clubPlayerId)).size!==11)throw new Error("INVALID_LINEUP");const players=await this.squads.listOwnedClubSquad(userId,clubId),byId=new Map(players.map(p=>[p.clubPlayerId,p]));const assignments=formation.slots.map(slot=>{const pick=picks.find(p=>p.slotKey===slot.key),player=pick&&byId.get(pick.clubPlayerId);if(!player)throw new Error("INVALID_PLAYER");return{slot_key:slot.key,slot_position:slot.position,club_player_id:player.clubPlayerId,effective_rating:effectiveRating({id:player.clubPlayerId,overall:player.overall,primaryPosition:player.primaryPosition,secondaryPosition:player.secondaryPosition,fitness:player.fitness,form:player.form,morale:player.morale},slot.position)};});await this.save(userId,clubId,code,assignments);}
  async lineup(userId:string,clubId:string):Promise<{formation:string;players:LineupEntry[]}>{await this.get(userId,clubId);const{data,error}=await this.db.from("lineup_players").select("slot_key,slot_position,effective_rating,club_players!inner(id,players!inner(short_name,player_attributes!inner(overall))),lineups!inner(league_club_id,formations!inner(name),league_clubs!inner(manager_user_id))").eq("lineups.league_club_id",clubId).eq("lineups.league_clubs.manager_user_id",userId);if(error)throw error;if(!data?.length){const tactic=await this.get(userId,clubId);await this.autoSave(userId,clubId,tactic.formationCode);return this.lineup(userId,clubId);}const formation=one<any>(one<any>(data[0]!.lineups).formations).name;return{formation,players:data.map((row:any)=>{const clubPlayer=one<any>(row.club_players),player=one<any>(clubPlayer.players);return{clubPlayerId:clubPlayer.id,slotKey:row.slot_key,slotPosition:row.slot_position,shortName:player.short_name,overall:one<any>(player.player_attributes).overall,effectiveRating:Number(row.effective_rating)};})};}

  async swapOrAssignPlayer(
    userId: string,
    clubId: string,
    targetSlotKey: string,
    clubPlayerId: string
  ): Promise<{ formation: string; players: LineupEntry[] }> {
    const current = await this.lineup(userId, clubId);
    const tactic = await this.get(userId, clubId);
    const formation = (await this.listFormations()).find((f) => f.code === tactic.formationCode);
    if (!formation) throw new Error("FORMATION_NOT_FOUND");

    const targetSlot = formation.slots.find((s) => s.key === targetSlotKey);
    if (!targetSlot) throw new Error("SLOT_NOT_FOUND");

    const squad = await this.squads.listOwnedClubSquad(userId, clubId);
    const candidate = squad.find((p) => p.clubPlayerId === clubPlayerId);
    if (!candidate) throw new Error("PLAYER_NOT_IN_CLUB");

    // Check if candidate is already in another slot
    const existingSlot = current.players.find((p) => p.clubPlayerId === clubPlayerId);
    const incumbent = current.players.find((p) => p.slotKey === targetSlotKey);

    const picks: Array<{ slotKey: string; clubPlayerId: string }> = [];

    for (const slot of formation.slots) {
      if (slot.key === targetSlotKey) {
        picks.push({ slotKey: slot.key, clubPlayerId });
      } else if (existingSlot && slot.key === existingSlot.slotKey && incumbent) {
        // Atomic swap: put the incumbent into the slot that the candidate vacated
        picks.push({ slotKey: slot.key, clubPlayerId: incumbent.clubPlayerId });
      } else {
        const existingPick = current.players.find((p) => p.slotKey === slot.key);
        if (existingPick && existingPick.clubPlayerId !== clubPlayerId) {
          picks.push({ slotKey: slot.key, clubPlayerId: existingPick.clubPlayerId });
        }
      }
    }

    // Ensure 11 slots are filled
    if (picks.length < 11) {
      const used = new Set(picks.map((p) => p.clubPlayerId));
      for (const slot of formation.slots) {
        if (!picks.some((p) => p.slotKey === slot.key)) {
          const available = squad.filter((p) => !used.has(p.clubPlayerId));
          const best = available.sort(
            (a, b) =>
              effectiveRating(
                {
                  id: b.clubPlayerId,
                  overall: b.overall,
                  primaryPosition: b.primaryPosition,
                  secondaryPosition: b.secondaryPosition,
                  fitness: b.fitness,
                  form: b.form,
                  morale: b.morale,
                },
                slot.position
              ) -
              effectiveRating(
                {
                  id: a.clubPlayerId,
                  overall: a.overall,
                  primaryPosition: a.primaryPosition,
                  secondaryPosition: a.secondaryPosition,
                  fitness: a.fitness,
                  form: a.form,
                  morale: a.morale,
                },
                slot.position
              )
          )[0];
          if (best) {
            used.add(best.clubPlayerId);
            picks.push({ slotKey: slot.key, clubPlayerId: best.clubPlayerId });
          }
        }
      }
    }

    await this.saveManual(userId, clubId, tactic.formationCode, picks);
    return this.lineup(userId, clubId);
  }
}
