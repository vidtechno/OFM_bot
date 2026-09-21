const groups: Record<string,string[]>={
 GK:["GK"],CB:["CB","LB","RB","CDM"],LB:["LB","LWB","RB","CB","LM"],RB:["RB","RWB","LB","CB","RM"],
 LWB:["LWB","LB","LM","RWB"],RWB:["RWB","RB","RM","LWB"],CDM:["CDM","CM","CB","CAM"],CM:["CM","CDM","CAM","LM","RM"],
 CAM:["CAM","CM","CF","LM","RM"],LM:["LM","LW","LWB","CM","RM"],RM:["RM","RW","RWB","CM","LM"],
 LW:["LW","LM","RW","CF","ST","CAM"],RW:["RW","RM","LW","CF","ST","CAM"],CF:["CF","ST","CAM","LW","RW"],ST:["ST","CF","LW","RW"],
};
export function positionCompatibility(primary:string,secondary:string|null,slot:string):number{
 if(primary===slot)return 1;if(secondary===slot)return .96;
 const index=groups[slot]?.indexOf(primary)??-1;if(index===1)return .9;if(index===2)return .86;if(index>=3)return .78;
 return (primary === "GK" || slot === "GK") ? 0.35 : 0.62;
}
