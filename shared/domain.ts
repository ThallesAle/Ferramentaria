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
 if(v.kind==='saida'&&(!v.employee.trim()||!v.machine.trim()||!v.work.trim()||!v.part.trim()))
  c.addIssue({code:'custom',message:'Informe funcionário, máquina, obra e peça.'});
});
export const movementUpdateSchema=z.object({movementId:z.string().min(1).max(160)}).and(movementSchema);
export const itemUpdateSchema=itemSchema.omit({stock:true});
// O ID original identifica o cadastro a editar; newId é o código que substituirá o antigo.
// Manter newId opcional conserva compatibilidade com comandos anteriores.
export const employeeUpdateSchema=employeeSchema.extend({newId:text.optional()});
export type Item=z.infer<typeof itemSchema>;
export type Employee=z.infer<typeof employeeSchema>;
export type MovementInput=z.infer<typeof movementSchema>;
export type MovementCorrection={at:string,before:MovementInput};
export type Movement=MovementInput&{id:string,date:string,reversalOf?:string,corrections?:MovementCorrection[]};
export type State={items:Item[],employees:Employee[],movements:Movement[],brand:string,machines:string[],works:string[],parts:string[]};
export type Command=
 |{type:'item',payload:Item}
 |{type:'item:update',payload:z.infer<typeof itemUpdateSchema>}
 |{type:'employee',payload:Employee}
 |{type:'employee:update',payload:Employee & {newId:string}}
 |{type:'movement',payload:MovementInput}
 |{type:'movement:update',payload:z.infer<typeof movementUpdateSchema>}
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
 id:z.string().min(1).max(160),date:z.string().datetime(),reversalOf:z.string().min(1).max(160).optional(),
 corrections:z.array(z.object({at:z.string().datetime(),before:z.object({
  kind:z.enum(['entrada','saida']),code:text,quantity:qty.min(1),employee:z.string().max(160),
  machine:z.string().max(160),work:z.string().max(160),part:z.string().max(160),note:z.string().max(500)
 })})).max(100).optional()
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

// A interface pode sugerir nomes, mas a validação deve ocorrer também no SQLite.
// Acentuação é preservada; maiúsculas e espaços externos podem ser corrigidos automaticamente.
function validateMovementReferences(state:State,v:MovementInput):MovementInput{
 if(v.kind!=='saida')return v;
 if(!state.employees.some(e=>e.id===v.employee))throw Error('Funcionário não encontrado. Cadastre antes de registrar.');
 const resolve=(entries:string[],value:string,label:string)=>{
  const registered=entries.find(n=>n.toLocaleLowerCase('pt-BR')===value.trim().toLocaleLowerCase('pt-BR'));
  if(!registered)throw Error(`${label} não cadastrada(o). Escolha um registro em Máquinas, obras e peças.`);
  return registered;
 };
 return {...v,machine:resolve(state.machines,v.machine,'Máquina'),work:resolve(state.works,v.work,'Obra'),part:resolve(state.parts,v.part,'Peça')};
}

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
  const newId=v.newId??v.id;
  const normalizedId=newId.toLocaleLowerCase('pt-BR');
  const normalizedSso=v.sso.toLocaleLowerCase('pt-BR');
  if(next.employees.some(e=>e!==employee&&(e.id.toLocaleLowerCase('pt-BR')===normalizedId||e.sso.toLocaleLowerCase('pt-BR')===normalizedSso)))
   throw Error('ID ou SSO já cadastrado. Informe valores exclusivos.');
  // O ID é a referência das saídas: alterá-lo exige migrar, na mesma transação,
  // os registros atuais, estornos antigos e referências guardadas nas correções.
  if(newId!==v.id){
   for(const movement of next.movements){
    if(movement.employee===v.id)movement.employee=newId;
    for(const correction of movement.corrections??[]){
     if(correction.before.employee===v.id)correction.before.employee=newId;
    }
   }
  }
  Object.assign(employee,{id:newId,sso:v.sso,name:v.name,area:v.area});
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
  const {corrections:previousCorrections,...snapshot}=original;
  next.movements.unshift({...snapshot,id:crypto.randomUUID(),date:new Date().toISOString(),kind,note:`Estorno de ${original.id.slice(0,8)}: ${input.reason}`,reversalOf:original.id});
 }else if(command.type==='movement:update'){
  const {movementId,...fields}=movementUpdateSchema.parse(command.payload);
  const old=next.movements.find(m=>m.id===movementId);
  if(!old)throw Error('Movimentação não encontrada.');
  if(old.reversalOf||next.movements.some(m=>m.reversalOf===old.id))
   throw Error('Movimentações estornadas e estornos não podem ser editados.');
  if(old.kind!==fields.kind)throw Error('O tipo de movimentação não pode ser alterado na edição.');
  const v=validateMovementReferences(next,fields);
  const source=next.items.find(i=>i.code===old.code);
  const destination=next.items.find(i=>i.code===v.code);
  if(!source||!destination)throw Error('Inserto não encontrado.');
  // Reverter o efeito anterior e aplicar o corrigido, tudo na mesma transação.
  // Também funciona quando código e quantidade mudam simultaneamente.
  source.stock+=old.kind==='entrada'?-old.quantity:old.quantity;
  destination.stock+=v.kind==='entrada'?v.quantity:-v.quantity;
  for(const item of next.items){
   if(item.stock<0)throw Error('Correção bloqueada: saldo insuficiente para ajustar a movimentação.');
   if(item.stock>1000000)throw Error('Correção bloqueada: limite de estoque excedido.');
  }
  const before:MovementInput={kind:old.kind,code:old.code,quantity:old.quantity,employee:old.employee,machine:old.machine,work:old.work,part:old.part,note:old.note};
  if(Object.keys(before).every(k=>before[k as keyof MovementInput]===v[k as keyof MovementInput]))
   throw Error('Nenhuma informação foi alterada.');
  if((old.corrections?.length??0)>=100)throw Error('Limite de correções atingido para esta movimentação.');
  Object.assign(old,v,{corrections:[...(old.corrections??[]),{at:new Date().toISOString(),before}]});
 }else if(command.type==='movement'){
  const v=validateMovementReferences(next,movementSchema.parse(command.payload));
  const item=next.items.find(i=>i.code===v.code);
  if(!item)throw Error('Inserto não encontrado.');
  if(v.kind==='saida'&&item.stock<v.quantity)throw Error('Saldo insuficiente para esta saída.');
  item.stock+=v.kind==='entrada'?v.quantity:-v.quantity;
  if(item.stock>1000000)throw Error('Limite de estoque excedido.');
  next.movements.unshift({...v,id:crypto.randomUUID(),date:new Date().toISOString()});
 }else throw Error('Operação não permitida.');
 return next;
}

