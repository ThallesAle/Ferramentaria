import {z} from 'zod';

const text=z.string().trim().min(1,'Preencha os campos obrigatórios.').max(160);
const qty=z.number().int().min(0).max(1000000);
export const itemSchema=z.object({code:text,description:text,stock:qty,min:qty,location:text});
export const employeeSchema=z.object({id:text,sso:text,name:text,area:text});
export const movementSchema=z.object({
 kind:z.enum(['entrada','saida']),code:text,quantity:qty.min(1),
 employee:z.string().max(160),machine:z.string().max(160),work:z.string().max(160),
 part:z.string().max(160),note:z.string().max(500)
}).superRefine((v,c)=>{
 if(v.kind==='saida'&&(!v.employee.trim()||!v.machine.trim()||!v.work.trim()))
  c.addIssue({code:'custom',message:'Informe funcionário, máquina e obra.'});
});
export const itemUpdateSchema=itemSchema.omit({stock:true});
export const employeeUpdateSchema=employeeSchema;
export type Item=z.infer<typeof itemSchema>;
export type Employee=z.infer<typeof employeeSchema>;
export type MovementInput=z.infer<typeof movementSchema>;
export type Movement=MovementInput&{id:string,date:string,reversalOf?:string};
export type State={items:Item[],employees:Employee[],movements:Movement[],brand:string,machines:string[],works:string[],parts:string[]};
export type Command=
 |{type:'item',payload:Item}
 |{type:'item:update',payload:z.infer<typeof itemUpdateSchema>}
 |{type:'employee',payload:Employee}
 |{type:'employee:update',payload:Employee}
 |{type:'movement',payload:MovementInput}
 |{type:'brand',payload:string}
 |{type:'machine',payload:string}
 |{type:'work',payload:string}
 |{type:'part',payload:string}
 |{type:'reversal',payload:{movementId:string,reason:string}}
 |{type:'import:items',payload:Item[]}
 |{type:'import:employees',payload:Employee[]};
export const emptyState=():State=>({items:[],employees:[],movements:[],brand:'Ferramentaria',machines:[],works:[],parts:[]});

// Backups nunca são executados como comandos nem tratados como dados confiáveis.
// A versão 1 mantém compatibilidade com os backups exportados na Fase 1.
const savedMovementSchema=z.object({
 kind:z.enum(['entrada','saida']),code:text,quantity:qty.min(1),
 employee:z.string().max(160),machine:z.string().max(160),work:z.string().max(160),
 part:z.string().max(160),note:z.string().max(500),
 id:z.string().min(1).max(160),date:z.string().datetime(),reversalOf:z.string().min(1).max(160).optional()
});
export const stateSchema=z.object({
 items:z.array(itemSchema).max(50000),employees:z.array(employeeSchema).max(50000),
 movements:z.array(savedMovementSchema).max(250000),brand:text.max(40),
 machines:z.array(text).max(10000).default([]),works:z.array(text).max(10000).default([]),parts:z.array(text).max(10000).default([])
}).superRefine((state,ctx)=>{
 const codes=new Set<string>();
 for(const item of state.items){
  if(codes.has(item.code))ctx.addIssue({code:'custom',message:'Backup contém códigos de inserto duplicados.'});
  codes.add(item.code);
 }
 const ids=new Set<string>(),ssos=new Set<string>();
 for(const employee of state.employees){
  if(ids.has(employee.id)||ssos.has(employee.sso))ctx.addIssue({code:'custom',message:'Backup contém funcionários duplicados.'});
  ids.add(employee.id);ssos.add(employee.sso);
 }
 const machineNames=state.machines.map(name=>name.toLocaleLowerCase('pt-BR'));
 const workNames=state.works.map(name=>name.toLocaleLowerCase('pt-BR'));
 const partNames=state.parts.map(name=>name.toLocaleLowerCase('pt-BR'));
 if(new Set(machineNames).size!==machineNames.length||new Set(workNames).size!==workNames.length||new Set(partNames).size!==partNames.length)ctx.addIssue({code:'custom',message:'Backup contém máquinas, obras ou peças duplicadas.'});
 const movementIds=new Set<string>();
 for(const movement of state.movements){
  if(movementIds.has(movement.id))ctx.addIssue({code:'custom',message:'Backup contém movimentações duplicadas.'});
  movementIds.add(movement.id);
  if(!codes.has(movement.code))ctx.addIssue({code:'custom',message:'Backup contém movimentação com inserto inexistente.'});
  if(movement.kind==='saida'&&!ids.has(movement.employee)&&!movement.reversalOf)ctx.addIssue({code:'custom',message:'Backup contém saída com funcionário inexistente.'});
 }
 const movementById=new Map(state.movements.map(m=>[m.id,m]));
 const reversed=new Set<string>();
 for(const movement of state.movements){
  if(!movement.reversalOf)continue;
  const original=movementById.get(movement.reversalOf);
  if(!original||original.reversalOf||original.kind===movement.kind||original.code!==movement.code||original.quantity!==movement.quantity||reversed.has(original.id))ctx.addIssue({code:'custom',message:'Backup contém estorno inválido ou duplicado.'});
  if(original)reversed.add(original.id);
 }
});
export const backupSchema=z.object({version:z.literal(1),exportedAt:z.string().datetime(),state:stateSchema});

export function applyCommand(state:State,command:Command):State{
 const next=structuredClone(state);
 if(command.type==='item'){
  const v=itemSchema.parse(command.payload);
  if(next.items.some(i=>i.code.toLocaleLowerCase('pt-BR')===v.code.toLocaleLowerCase('pt-BR')))throw Error('Código de inserto já cadastrado.');
  next.items.push(v);
 }else if(command.type==='item:update'){
  const v=itemUpdateSchema.parse(command.payload);
  const item=next.items.find(i=>i.code===v.code);
  if(!item)throw Error('Inserto não encontrado.');
  // O saldo só pode mudar por entradas e saídas auditáveis.
  Object.assign(item,{description:v.description,min:v.min,location:v.location});
 }else if(command.type==='employee'){
  const v=employeeSchema.parse(command.payload);
  if(next.employees.some(i=>i.id.toLocaleLowerCase('pt-BR')===v.id.toLocaleLowerCase('pt-BR')||i.sso.toLocaleLowerCase('pt-BR')===v.sso.toLocaleLowerCase('pt-BR')))throw Error('ID ou SSO já cadastrado.');
  next.employees.push(v);
 }else if(command.type==='employee:update'){
  const v=employeeUpdateSchema.parse(command.payload);
  const employee=next.employees.find(e=>e.id===v.id);
  if(!employee)throw Error('Funcionário não encontrado.');
  if(next.employees.some(e=>e.id!==v.id&&e.sso===v.sso))throw Error('SSO já cadastrado.');
  Object.assign(employee,{sso:v.sso,name:v.name,area:v.area});
 }else if(command.type==='brand'){
  next.brand=text.max(40).parse(command.payload);
 }else if(command.type==='machine'||command.type==='work'||command.type==='part'){
  const value=text.max(80).parse(command.payload);
  const entries=command.type==='machine'?next.machines:command.type==='work'?next.works:next.parts;
  if(entries.some(entry=>entry.toLocaleLowerCase('pt-BR')===value.toLocaleLowerCase('pt-BR')))throw Error('Cadastro já existe.');
  entries.push(value);
  entries.sort((a,b)=>a.localeCompare(b,'pt-BR'));
 }else if(command.type==='import:items'){
  const rows=z.array(itemSchema).min(1).max(10000).parse(command.payload);
  const existing=new Set(next.items.map(i=>i.code.toLocaleLowerCase('pt-BR')));
  for(const item of rows){
   const id=item.code.toLocaleLowerCase('pt-BR');
   if(existing.has(id))throw Error(`Inserto duplicado ou já cadastrado: ${item.code}. Nenhuma linha foi importada.`);
   existing.add(id);
  }
  next.items.push(...rows);
 }else if(command.type==='import:employees'){
  const rows=z.array(employeeSchema).min(1).max(10000).parse(command.payload);
  const ids=new Set(next.employees.map(e=>e.id.toLocaleLowerCase('pt-BR')));
  const ssos=new Set(next.employees.map(e=>e.sso.toLocaleLowerCase('pt-BR')));
  for(const employee of rows){
   const id=employee.id.toLocaleLowerCase('pt-BR'),sso=employee.sso.toLocaleLowerCase('pt-BR');
   if(ids.has(id)||ssos.has(sso))throw Error(`Funcionário duplicado ou já cadastrado: ${employee.id} / ${employee.sso}. Nenhuma linha foi importada.`);
   ids.add(id);ssos.add(sso);
  }
  next.employees.push(...rows);
 }else if(command.type==='reversal'){
  const input=z.object({movementId:z.string().min(1).max(160),reason:z.string().trim().min(3,'Informe um motivo com ao menos 3 caracteres.').max(400)}).parse(command.payload);
  const original=next.movements.find(m=>m.id===input.movementId);
  if(!original)throw Error('Movimentação não encontrada.');
  if(original.reversalOf)throw Error('Um estorno não pode ser estornado.');
  if(next.movements.some(m=>m.reversalOf===original.id))throw Error('Esta movimentação já foi estornada.');
  const item=next.items.find(i=>i.code===original.code);
  if(!item)throw Error('Inserto não encontrado.');
  const kind=original.kind==='entrada'?'saida':'entrada';
  if(kind==='saida'&&item.stock<original.quantity)throw Error('Não é possível estornar: o saldo atual é insuficiente.');
  if(kind==='entrada'&&item.stock+original.quantity>1000000)throw Error('Estorno ultrapassaria o limite de estoque.');
  item.stock+=kind==='entrada'?original.quantity:-original.quantity;
  next.movements.unshift({...original,id:crypto.randomUUID(),date:new Date().toISOString(),kind,note:`Estorno de ${original.id.slice(0,8)}: ${input.reason}`,reversalOf:original.id});
 }else if(command.type==='movement'){
  const v=movementSchema.parse(command.payload);
  const item=next.items.find(i=>i.code===v.code);
  if(!item)throw Error('Inserto não encontrado.');
  if(v.kind==='saida'&&!next.employees.some(e=>e.id===v.employee))throw Error('Funcionário não encontrado.');
  if(v.kind==='saida'&&item.stock<v.quantity)throw Error('Saldo insuficiente para esta saída.');
  item.stock+=v.kind==='entrada'?v.quantity:-v.quantity;
  if(item.stock>1000000)throw Error('Limite de estoque excedido.');
  next.movements.unshift({...v,id:crypto.randomUUID(),date:new Date().toISOString()});
 }else throw Error('Operação não permitida.');
 return next;
}
