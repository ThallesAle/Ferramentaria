import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Store} from '../electron/store';
import {backupSchema,type MovementInput} from '../shared/domain';
import {buildReport} from '../shared/report';

const filters={from:'',to:'',code:'',machine:'',work:'',part:'',employee:'',kind:'todos' as const};
function fixture(fn:(store:Store)=>void){
 const dir=mkdtempSync(path.join(tmpdir(),'ferramentaria-correcoes-'));
 const db=new Store(path.join(dir,'teste.sqlite'));
 try{
  db.command({type:'item',payload:{code:'INS-A',description:'Inserto A',stock:20,min:0,location:'A'}});
  db.command({type:'item',payload:{code:'INS-B',description:'Inserto B',stock:9,min:0,location:'B'}});
  db.command({type:'employee',payload:{id:'1',sso:'001',name:'Pessoa',area:'Setor'}});
  db.command({type:'machine',payload:'Máquina A'});db.command({type:'machine',payload:'Máquina B'});
  db.command({type:'work',payload:'Obra A'});db.command({type:'work',payload:'Obra B'});
  db.command({type:'part',payload:'Peça A'});db.command({type:'part',payload:'Peça B'});
  fn(db);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
}
const saida:MovementInput={kind:'saida',code:'INS-A',quantity:5,employee:'1',machine:'Máquina A',work:'Obra A',part:'Peça A',note:''};

test('saída exige máquina, obra e peça cadastradas, com rejeição atômica',()=>fixture(db=>{
 for(const invalid of [
  {...saida,machine:''},{...saida,machine:'Inexistente'},
  {...saida,work:''},{...saida,work:'Não cadastrada'},
  {...saida,part:''},{...saida,part:'Não cadastrada'},
  {...saida,employee:'inexistente'}
 ]){
  const before=db.read();
  assert.throws(()=>db.command({type:'movement',payload:invalid}));
  assert.deepEqual(db.read(),before);
 }
 const saved=db.command({type:'movement',payload:{...saida,machine:' máquina a ',work:'obra a',part:'peça a'}});
 assert.equal(saved.movements[0].machine,'Máquina A');
 assert.equal(saved.movements[0].work,'Obra A');
 assert.equal(saved.movements[0].part,'Peça A');
 assert.equal(saved.items[0].stock,15);
}));

test('corrigir código, quantidade, máquina, obra e peça muda estoque e relatório sem duplicar movimento',()=>fixture(db=>{
 db.command({type:'movement',payload:saida});
 const original=db.read().movements[0];
 const after=db.command({type:'movement:update',payload:{...saida,movementId:original.id,code:'INS-B',quantity:4,machine:'Máquina B',work:'Obra B',part:'Peça B',note:'Cadastro corrigido'}});
 assert.equal(after.movements.length,1);
 assert.equal(after.movements[0].id,original.id);
 assert.equal(after.movements[0].date,original.date);
 assert.equal(after.movements[0].code,'INS-B');
 assert.equal(after.movements[0].corrections?.length,1);
 assert.equal(after.movements[0].corrections?.[0].before.code,'INS-A');
 assert.equal(after.items.find(i=>i.code==='INS-A')?.stock,20);
 assert.equal(after.items.find(i=>i.code==='INS-B')?.stock,5);
 const report=buildReport(after,filters);
 assert.deepEqual(report.byCode.map(r=>[r.code,r.description,r.quantity]),[['INS-B','Inserto B',4]]);
 assert.equal(report.byMachine[0].name,'Máquina B');
 assert.equal(report.byWork[0].name,'Obra B');
 assert.equal(report.byPart[0].name,'Peça B');
 assert.deepEqual(backupSchema.parse({version:1,exportedAt:new Date().toISOString(),state:after}).state,after);
}));

test('não permite correções com saldo negativo nem editar movimentos estornados',()=>fixture(db=>{
 db.command({type:'movement',payload:saida});
 const id=db.read().movements[0].id;
 const old=db.read();
 assert.throws(()=>db.command({type:'movement:update',payload:{...saida,movementId:id,code:'INS-B',quantity:10}}),/saldo insuficiente/);
 assert.deepEqual(db.read(),old);
 assert.throws(()=>db.command({type:'movement:update',payload:{...saida,movementId:id,kind:'entrada'}}),/tipo/);
 assert.deepEqual(db.read(),old);
 db.command({type:'reversal',payload:{movementId:id,reason:'Correção anulada'}});
 const before=db.read();
 assert.throws(()=>db.command({type:'movement:update',payload:{...saida,movementId:id,part:'Peça B'}}),/estornad/);
 assert.throws(()=>db.command({type:'movement:update',payload:{...saida,movementId:before.movements[0].id,part:'Peça B'}}),/estornad/);
 assert.deepEqual(db.read(),before);
}));

test('alterar o ID do funcionário preserva saídas e histórico de correções',()=>fixture(db=>{
 db.command({type:'movement',payload:saida});
 const movementId=db.read().movements[0].id;
 db.command({type:'movement:update',payload:{...saida,movementId,quantity:4,note:'Quantidade corrigida'}});
 const newState=db.command({type:'employee:update',payload:{id:'1',newId:'00127',sso:'001',name:'Pessoa',area:'Setor'}});
 assert.equal(newState.employees[0].id,'00127');
 assert.equal(newState.movements[0].employee,'00127');
 assert.equal(newState.movements[0].corrections?.[0].before.employee,'00127');
 assert.equal(newState.items.find(i=>i.code==='INS-A')?.stock,16);
 assert.equal(buildReport(newState,{...filters,employee:'00127'}).exitUnits,4);
 assert.equal(buildReport(newState,{...filters,employee:'1'}).exitUnits,0);
 assert.deepEqual(backupSchema.parse({version:1,exportedAt:new Date().toISOString(),state:newState}).state,newState);
 const restored=db.read();
 assert.deepEqual(restored,newState);
 db.command({type:'reversal',payload:{movementId,reason:'Retirada cancelada'}});
 const postReversal=db.read();
 assert.equal(postReversal.movements[0].employee,'00127');
 assert.equal(postReversal.movements[1].employee,'00127');
}));

test('não permite ID duplicado, inclusive diferença só de maiúsculas, e não modifica dados em falha',()=>fixture(db=>{
 db.command({type:'employee',payload:{id:'ABC',sso:'002',name:'Outra pessoa',area:'Setor'}});
 db.command({type:'movement',payload:saida});
 const previous=db.read();
 assert.throws(()=>db.command({type:'employee:update',payload:{id:'1',newId:'abc',sso:'001',name:'Pessoa',area:'Setor'}}),/ID ou SSO já cadastrado/);
 assert.deepEqual(db.read(),previous);
 assert.throws(()=>db.command({type:'employee:update',payload:{id:'1',newId:'3',sso:'002',name:'Pessoa',area:'Setor'}}),/ID ou SSO já cadastrado/);
 assert.deepEqual(db.read(),previous);
 assert.throws(()=>db.command({type:'employee:update',payload:{id:'1',newId:' ',sso:'001',name:'Pessoa',area:'Setor'}}));
 assert.deepEqual(db.read(),previous);
}));

test('aceita digitação de cadastros de máquina, obra e peça com caixa e espaços diferentes',()=>fixture(db=>{
 const saved=db.command({type:'movement',payload:{...saida,machine:'  MÁQUINA A  ',work:'  OBRA A',part:' peça a '}});
 assert.equal(saved.movements[0].machine,'Máquina A');
 assert.equal(saved.movements[0].work,'Obra A');
 assert.equal(saved.movements[0].part,'Peça A');
 assert.equal(saved.items[0].stock,15);
 const before=db.read();
 assert.throws(()=>db.command({type:'movement',payload:{...saida,machine:'Máquina inexistente'}}),/Máquina não cadastrada/);
 assert.deepEqual(db.read(),before);
}));
