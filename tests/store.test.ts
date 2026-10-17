import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Store} from '../electron/store';
test('SQLite: cadastro, saldo, rollback, duplicidade e persistência após reabrir',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'ferramentaria-test-'));const file=path.join(dir,'test.sqlite');let db=new Store(file);
 try{
 assert.equal(db.read().items.length,0);
 db.command({type:'item',payload:{code:'A',description:'Teste',stock:10,min:2,location:'A1'}});
 db.command({type:'employee',payload:{id:'1',sso:'S1',name:'Teste',area:'Usinagem'}});
 const movement={kind:'saida' as const,code:'A',quantity:3,employee:'1',machine:'ROMI',work:'Obra',part:'',note:''};
 db.command({type:'movement',payload:movement});assert.equal(db.read().items[0].stock,7);
 assert.throws(()=>db.command({type:'movement',payload:{...movement,quantity:8}}),/Saldo insuficiente/);
 assert.throws(()=>db.command({type:'movement',payload:{...movement,quantity:-1}}));
 assert.throws(()=>db.command({type:'movement',payload:{...movement,employee:'missing'}}),/Funcionário/);
 assert.throws(()=>db.command({type:'item',payload:{code:'A',description:'Outro',stock:0,min:0,location:'B'}}),/já cadastrado/);
 assert.equal(db.read().movements.length,1);assert.equal(db.read().items[0].stock,7);
 db.command({type:'movement',payload:{...movement,kind:'entrada',quantity:5}});
 db.close();db=new Store(file);assert.equal(db.read().items[0].stock,12);assert.equal(db.read().movements.length,2);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('Fase 2: editar inserto não altera saldo, preservar ID/SSO e atualizar cadastro',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'ferramentaria-edit-'));
 const db=new Store(path.join(dir,'edit.sqlite'));
 try{
  db.command({type:'item',payload:{code:'INS-10',description:'Primeira descrição',stock:15,min:5,location:'G1'}});
  db.command({type:'employee',payload:{id:'0001',sso:'SSO-A',name:'Ana',area:'Usinagem'}});
  db.command({type:'employee',payload:{id:'0002',sso:'SSO-B',name:'Carlos',area:'Montagem'}});
  db.command({type:'item:update',payload:{code:'INS-10',description:'Descrição atualizada',min:8,location:'G2'}});
  assert.equal(db.read().items[0].stock,15);
  assert.equal(db.read().items[0].description,'Descrição atualizada');
  assert.equal(db.read().items[0].min,8);
  db.command({type:'employee:update',payload:{id:'0001',sso:'SSO-A2',name:'Ana Martins',area:'Ferramentaria'}});
  assert.equal(db.read().employees[0].name,'Ana Martins');
  assert.throws(()=>db.command({type:'employee:update',payload:{id:'0001',sso:'SSO-B',name:'Ana',area:'Ferramentaria'}}),/SSO já cadastrado/);
  assert.throws(()=>db.command({type:'item:update',payload:{code:'ausente',description:'Teste',min:1,location:'G1'}}),/não encontrado/);
  assert.equal(db.read().employees[0].sso,'SSO-A2');
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('Fase 2: restauração válida e rejeição atômica de backup inválido',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'ferramentaria-restore-'));
 const db=new Store(path.join(dir,'restore.sqlite'));
 try{
  db.command({type:'item',payload:{code:'A',description:'Original',stock:20,min:2,location:'Estoque'}});
  const previous=db.read();
  assert.throws(()=>db.restore({version:99,exportedAt:new Date().toISOString(),state:previous}));
  assert.deepEqual(db.read(),previous);
  assert.throws(()=>db.restore({version:1,exportedAt:new Date().toISOString(),state:{...previous,items:[previous.items[0],previous.items[0]]}}));
  assert.deepEqual(db.read(),previous);
  assert.throws(()=>db.restore({version:1,exportedAt:new Date().toISOString(),state:{...previous,items:[{...previous.items[0],stock:-50}]}}));
  assert.deepEqual(db.read(),previous);
  const restored={...previous,brand:'Sistema Restaurado',items:[{...previous.items[0],stock:55}]};
  db.restore({version:1,exportedAt:new Date().toISOString(),state:restored});
  assert.deepEqual(db.read(),restored);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
