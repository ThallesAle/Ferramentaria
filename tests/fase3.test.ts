import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Store} from '../electron/store';
import {parseCatalogCsv,parseCsv} from '../shared/importCsv';
import {backupSchema} from '../shared/domain';

function withStore(fn:(store:Store,file:string)=>void){
 const dir=mkdtempSync(path.join(tmpdir(),'ferramentaria-fase3-'));
 const file=path.join(dir,'test.sqlite');
 const db=new Store(file);
 try{fn(db,file);}finally{db.close();rmSync(dir,{recursive:true,force:true});}
}

test('CSV UTF-8 da planilha: ponto e vírgula, vírgula, aspas e caracteres acentuados',()=>{
 const rows=parseCsv('\uFEFFcodigo;descricao;estoque;minimo;localizacao\r\nA;"Inserto; ROMX";4;2;A-1\r\n');
 assert.equal(rows[1][1],'Inserto; ROMX');
 const items=parseCatalogCsv('Código;Descrição;Estoque;Mínimo;Localização\nF001;"Inserto; teste";8;3;A-01','items');
 assert.equal(items.length,1);
 assert.equal(items[0].code,'F001');
 assert.equal(items[0].description,'Inserto; teste');
 const employees=parseCatalogCsv('ID,SSO,Nome,Área\n0001,S001,"José, da Silva",Usinagem','employees');
 assert.equal(employees[0].id,'0001');
 assert.equal(employees[0].name,'José, da Silva');
 assert.throws(()=>parseCatalogCsv('id;sso;nome;area\n1;S001;Ana','employees'),/Linha 2/);
 assert.throws(()=>parseCatalogCsv('codigo;descricao;estoque;minimo;localizacao\nF1;ABC;1,5;1;A','items'),/Linha 2/);
});

test('Fase 3: importação em lote é atômica, não sobrescreve cadastros',()=>withStore(db=>{
 const rows=parseCatalogCsv('codigo;descricao;estoque;minimo;localizacao\nA;Inserto A;15;5;X1\nB;Inserto B;8;4;X2','items');
 db.command({type:'import:items',payload:rows as import('../shared/domain').Item[]});
 assert.equal(db.read().items.length,2);
 const initial=db.read();
 assert.throws(()=>db.command({type:'import:items',payload:[{code:'C',description:'Inserto C',stock:1,min:0,location:'X'},{code:'A',description:'Duplicado',stock:1,min:0,location:'X'}]}),/duplicado/);
 assert.deepEqual(db.read(),initial);
 const employees=parseCatalogCsv('id;sso;nome;area\n0001;S001;Ana;Usinagem\n0002;S002;João;Ferramentaria','employees');
 db.command({type:'import:employees',payload:employees as import('../shared/domain').Employee[]});
 assert.equal(db.read().employees.length,2);
 assert.throws(()=>db.command({type:'import:employees',payload:[{id:'0003',sso:'S001',name:'Duplicado',area:'A'}]}),/duplicado/);
 assert.equal(db.read().employees.length,2);
}));

test('Fase 3: estornos são registrados e bloqueados quando duplicados ou com saldo insuficiente',()=>withStore(db=>{
 db.command({type:'item',payload:{code:'A',description:'Inserto',stock:20,min:5,location:'A1'}});
 db.command({type:'employee',payload:{id:'1',sso:'SSO1',name:'Ana',area:'Usinagem'}});
 db.command({type:'machine',payload:'ROMI'});db.command({type:'work',payload:'Obra A'});db.command({type:'part',payload:'Eixo'});
 db.command({type:'movement',payload:{kind:'saida',code:'A',quantity:6,employee:'1',machine:'ROMI',work:'Obra A',part:'Eixo',note:''}});
 assert.equal(db.read().items[0].stock,14);
 const id=db.read().movements[0].id;
 db.command({type:'reversal',payload:{movementId:id,reason:'Registro duplicado'}});
 assert.equal(db.read().items[0].stock,20);
 assert.equal(db.read().movements.length,2);
 assert.equal(db.read().movements[0].reversalOf,id);
 assert.throws(()=>db.command({type:'reversal',payload:{movementId:id,reason:'Repetir'}}),/já foi estornada/);
 assert.throws(()=>db.command({type:'reversal',payload:{movementId:db.read().movements[0].id,reason:'Repetir'}}),/não pode ser estornado/);
 const before=db.read();
 assert.throws(()=>db.command({type:'reversal',payload:{movementId:id,reason:'a'}}));
 assert.deepEqual(db.read(),before);
 db.command({type:'movement',payload:{kind:'entrada',code:'A',quantity:10,employee:'',machine:'',work:'',part:'',note:''}});
 const entrada=db.read().movements[0].id;
 db.command({type:'movement',payload:{kind:'saida',code:'A',quantity:25,employee:'1',machine:'ROMI',work:'Obra A',part:'Eixo',note:''}});
 assert.equal(db.read().items[0].stock,5);
 assert.throws(()=>db.command({type:'reversal',payload:{movementId:entrada,reason:'Entrada incorreta'}}),/saldo atual é insuficiente/);
 assert.equal(db.read().items[0].stock,5);
}));

test('Fase 3: bancos e backups legados recebem cadastros opcionais vazios',()=>withStore((db,file)=>{
 db.command({type:'item',payload:{code:'A',description:'Teste',stock:1,min:0,location:'X'}});
 const current=db.read();
 // Simula backup da Fase 2 sem machines e works.
 const legacy={version:1,exportedAt:new Date().toISOString(),state:{items:current.items,employees:[],movements:[],brand:'Ferramentaria'}};
 assert.deepEqual(backupSchema.parse(legacy).state.machines,[]);
 db.restore(legacy);
 assert.deepEqual(db.read().works,[]);
 db.command({type:'machine',payload:'ROMI'});
 db.command({type:'work',payload:'Obra A'});
 assert.throws(()=>db.command({type:'machine',payload:'romi'}),/já existe/);
 assert.equal(db.read().machines[0],'ROMI');
 const restored=backupSchema.parse({version:1,exportedAt:new Date().toISOString(),state:db.read()});
 assert.deepEqual(restored.state.works,['Obra A']);
}));

test('Fase 5: catálogo de peças é persistente, impede repetição e migra backup antigo',()=>withStore(db=>{
 db.command({type:'part',payload:'Eixo principal'});
 assert.deepEqual(db.read().parts,['Eixo principal']);
 assert.throws(()=>db.command({type:'part',payload:'eixo principal'}),/já existe/);
 db.command({type:'item',payload:{code:'F100',description:'Inserto',stock:25,min:3,location:'A1'}});
 db.command({type:'employee',payload:{id:'001',sso:'0010',name:'Ana',area:'Torno'}});
 db.command({type:'machine',payload:'ROMI'});db.command({type:'work',payload:'Obra A'});
 db.command({type:'movement',payload:{kind:'saida',code:'F100',quantity:5,employee:'001',machine:'ROMI',work:'Obra A',part:'Eixo principal',note:''}});
 assert.equal(db.read().movements[0].part,'Eixo principal');
 const id=db.read().movements[0].id;
 db.command({type:'reversal',payload:{movementId:id,reason:'Correção de saída'}});
 assert.equal(db.read().movements[0].part,'Eixo principal');
 const exportable=backupSchema.parse({version:1,exportedAt:new Date().toISOString(),state:db.read()});
 assert.deepEqual(exportable.state.parts,['Eixo principal']);
 const legacy={version:1,exportedAt:new Date().toISOString(),state:{items:[],employees:[],movements:[],machines:[],works:[],brand:'Ferramentaria'}};
 db.restore(legacy);
 assert.deepEqual(db.read().parts,[]);
 assert.equal(backupSchema.parse(legacy).state.parts.length,0);
}));


test('v1.0.1: duas saídas seguidas para o mesmo funcionário preservam máquina, peça e obra',()=>withStore(db=>{
 db.command({type:'employee',payload:{id:'001',sso:'S001',name:'Ana',area:'Usinagem'}});
 db.command({type:'item',payload:{code:'INS-A',description:'Inserto A',stock:10,min:2,location:'A-01'}});
 db.command({type:'item',payload:{code:'INS-B',description:'Inserto B',stock:8,min:2,location:'A-02'}});
 db.command({type:'machine',payload:'ROMI'});db.command({type:'work',payload:'OB-42'});db.command({type:'part',payload:'Eixo maior'});
 const contexto={kind:'saida' as const,employee:'001',machine:'ROMI',work:'OB-42',part:'Eixo maior',note:'Pedido da mesma pessoa'};
 db.command({type:'movement',payload:{...contexto,code:'INS-A',quantity:3}});
 db.command({type:'movement',payload:{...contexto,code:'INS-B',quantity:2}});
 const after=db.read();
 assert.equal(after.movements.length,2);
 assert.deepEqual(after.movements.map(m=>m.code),['INS-B','INS-A']);
 assert.deepEqual(after.movements.map(m=>m.employee),['001','001']);
 assert.ok(after.movements.every(m=>m.machine==='ROMI'&&m.work==='OB-42'&&m.part==='Eixo maior'));
 assert.equal(after.items.find(i=>i.code==='INS-A')?.stock,7);
 assert.equal(after.items.find(i=>i.code==='INS-B')?.stock,6);
 // A próxima tentativa inválida não afeta os registros anteriores.
 assert.throws(()=>db.command({type:'movement',payload:{...contexto,code:'INS-B',quantity:50}}),/Saldo insuficiente/);
 assert.deepEqual(db.read(),after);
}));
