import {z} from 'zod';
import type {Employee,Movement,State} from './domain';

const dateField=z.union([z.literal(''),z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
export const reportFiltersSchema=z.object({
 from:dateField.default(''),to:dateField.default(''),
 code:z.string().max(160).default(''),machine:z.string().max(160).default(''),
 work:z.string().max(160).default(''),part:z.string().max(160).default(''),employee:z.string().max(160).default(''),
 kind:z.enum(['todos','entrada','saida']).default('todos')
}).strict().superRefine((f,ctx)=>{
 for(const [field,value] of [['from',f.from],['to',f.to]] as const){
  if(value){const d=new Date(`${value}T12:00:00`);if(!Number.isFinite(d.getTime())||localDateKey(d.toISOString())!==value)ctx.addIssue({code:'custom',path:[field],message:'Data inválida.'});}
 }
 if(f.from&&f.to&&f.from>f.to)ctx.addIssue({code:'custom',path:['to'],message:'Data final anterior à inicial.'});
});
export type ReportFilters=z.infer<typeof reportFiltersSchema>;
export type Ranking={name:string,quantity:number,records:number};
export type TrendPoint={label:string,quantity:number,records:number};
export type Report={filters:ReportFilters,generatedAt:string,allMovements:Movement[],effectiveMovements:Movement[],
 totalRecords:number,reversedRecords:number,entryRecords:number,exitRecords:number,entryUnits:number,exitUnits:number,
 machinesServed:number,employeesServed:number,lowItems:number,stockUnits:number,
 byCode:Ranking[],byMachine:Ranking[],byWork:Ranking[],byPart:Ranking[],byEmployee:Ranking[],trend:TrendPoint[]};

// Datas para relatórios seguem o horário LOCAL da instalação Windows, como exibido no aplicativo.
export function localDateKey(iso:string){const d=new Date(iso);if(!Number.isFinite(d.getTime()))return '';
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function initialReportFilters(now=new Date()):ReportFilters{
 const today=localDateKey(now.toISOString());
 return {from:`${today.slice(0,7)}-01`,to:today,code:'',machine:'',work:'',part:'',employee:'',kind:'todos'};
}
export function movementStatus(m:Movement,reversedIds:Set<string>):'Ativa'|'Estornada'|'Estorno'{
 return m.reversalOf?'Estorno':reversedIds.has(m.id)?'Estornada':'Ativa';
}
function rank(rows:Movement[],getName:(movement:Movement)=>string):Ranking[]{
 const map=new Map<string,Ranking>();
 for(const m of rows){const name=getName(m).trim()||'Não informado';const old=map.get(name)||{name,quantity:0,records:0};old.quantity+=m.quantity;old.records++;map.set(name,old);}
 return Array.from(map.values()).sort((a,b)=>b.quantity-a.quantity||a.name.localeCompare(b.name,'pt-BR'));
}
function trendRows(rows:Movement[],filters:ReportFilters):TrendPoint[]{
 const first=filters.from||rows.reduce((min,m)=>{const day=localDateKey(m.date);return !min||day<min?day:min;},'');
 const last=filters.to||rows.reduce((max,m)=>{const day=localDateKey(m.date);return day>max?day:max;},'');
 const days=first&&last?Math.round((Date.parse(`${last}T12:00:00Z`)-Date.parse(`${first}T12:00:00Z`))/86400000):0;
 const unit=days>90?'mes':days>40?'semana':'dia';
 const name=(iso:string)=>{const date=localDateKey(iso);if(unit==='mes')return date.slice(0,7);
  if(unit==='semana'){
   const d=new Date(`${date}T12:00:00`);const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);return localDateKey(d.toISOString());
  }
  return date;
 };
 const map=new Map<string,TrendPoint>();
 for(const m of rows){const label=name(m.date);const old=map.get(label)||{label,quantity:0,records:0};old.quantity+=m.quantity;old.records++;map.set(label,old);}
 return Array.from(map.values()).sort((a,b)=>a.label.localeCompare(b.label)).slice(-36);
}
export function buildReport(state:State,untrusted:ReportFilters,now=new Date()):Report{
 const filters=reportFiltersSchema.parse(untrusted);
 const reversedIds=new Set(state.movements.flatMap(m=>m.reversalOf?[m.reversalOf]:[]));
 const allMovements=state.movements.filter(m=>{
  const date=localDateKey(m.date);
  return (!filters.from||date>=filters.from)&&(!filters.to||date<=filters.to)&&
   (!filters.code||m.code===filters.code)&&(!filters.machine||m.machine===filters.machine)&&
   (!filters.work||m.work===filters.work)&&(!filters.part||m.part===filters.part)&&(!filters.employee||m.employee===filters.employee)&&
   (filters.kind==='todos'||m.kind===filters.kind);
 }).sort((a,b)=>b.date.localeCompare(a.date));
 // Relatório operacional RETROATIVO: original estornada não entra nas métricas,
 // e o estorno continua no extrato de auditoria. Saldo atual continua no SQLite.
 const effectiveMovements=allMovements.filter(m=>!m.reversalOf&&!reversedIds.has(m.id));
 const entries=effectiveMovements.filter(m=>m.kind==='entrada');
 const exits=effectiveMovements.filter(m=>m.kind==='saida');
 const people=new Map<string,Employee>(state.employees.map(e=>[e.id,e]));
 const byEmployee=rank(exits,m=>people.get(m.employee)?.name||m.employee);
 return {filters,generatedAt:now.toISOString(),allMovements,effectiveMovements,
  totalRecords:allMovements.length,reversedRecords:allMovements.filter(m=>m.reversalOf||reversedIds.has(m.id)).length,
  entryRecords:entries.length,exitRecords:exits.length,
  entryUnits:entries.reduce((n,m)=>n+m.quantity,0),exitUnits:exits.reduce((n,m)=>n+m.quantity,0),
  machinesServed:new Set(exits.map(m=>m.machine).filter(Boolean)).size,
  employeesServed:new Set(exits.map(m=>m.employee).filter(Boolean)).size,
  lowItems:state.items.filter(i=>i.stock<=i.min).length,
  stockUnits:state.items.reduce((n,i)=>n+i.stock,0),
  byCode:rank(exits,m=>m.code),byMachine:rank(exits,m=>m.machine),byWork:rank(exits,m=>m.work),byPart:rank(exits,m=>m.part),byEmployee,
  trend:trendRows(exits,filters)};
}
