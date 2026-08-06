export interface JobFreshness{jobId:string;firstSeen:string;lastSeen:string;lastChanged:string|null;observationCount:number;daysSinceLastSeen:number;changedSincePrevious:boolean}
export function daysSince(value:string,now=new Date()){return Math.max(0,Math.floor((now.getTime()-new Date(value).getTime())/86_400_000))}
export function freshnessLabel(days:number){return days>=30?"30일 이상 미관찰":days>=14?"14일 이상 미관찰":days>=7?"7일 이상 미관찰":"최근 관찰"}
