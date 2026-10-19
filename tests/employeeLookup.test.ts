import test from 'node:test';
import assert from 'node:assert/strict';
import {findEmployeeBySSO} from '../shared/employeeLookup';
import {applyCommand,emptyState,type Employee} from '../shared/domain';

const employees:Employee[]=[
 {id:'0001',sso:'00212504474',name:'Funcionário Um',area:'Usinagem'},
 {id:'0002',sso:'SSO0002',name:'Funcionária Dois',area:'Ferramentaria'}
];

test('SSO exato recupera nome e ID interno, sem selecionar funcionário',()=>{
 const employee=findEmployeeBySSO(employees,'00212504474');
 assert.equal(employee?.name,'Funcionário Um');
 assert.equal(employee?.id,'0001');
});

test('SSO aceita espaços externos e letras com caixa diferente',()=>{
 assert.equal(findEmployeeBySSO(employees,' sso0002 ')?.name,'Funcionária Dois');
});

test('SSO incompleto, inexistente e sem zeros à esquerda não resolve funcionário',()=>{
 assert.equal(findEmployeeBySSO(employees,'002125'),undefined);
 assert.equal(findEmployeeBySSO(employees,'212504474'),undefined);
 assert.equal(findEmployeeBySSO(employees,'9999'),undefined);
 assert.equal(findEmployeeBySSO(employees,'  '),undefined);
});

test('Saída salva ID interno do funcionário localizado pelo SSO',()=>{
 const state=emptyState();
 state.employees=employees;
 state.items=[{code:'F1',description:'Inserto de teste',stock:10,min:1,location:'A1'}];
 const id=findEmployeeBySSO(state.employees,'SSO0002')?.id;
 assert.ok(id);
 const result=applyCommand(state,{type:'movement',payload:{kind:'saida',code:'F1',quantity:2,employee:id,machine:'ROMI',work:'OBRA 1',part:'Eixo',note:''}});
 assert.equal(result.movements[0].employee,'0002');
 assert.equal(result.items[0].stock,8);
});

test('Duas saídas para o mesmo SSO mantêm o vínculo do funcionário',()=>{
 const state=emptyState();
 state.employees=employees;
 state.items=[{code:'F1',description:'Inserto A',stock:10,min:1,location:'A1'},{code:'F2',description:'Inserto B',stock:10,min:1,location:'A1'}];
 const id=findEmployeeBySSO(state.employees,'00212504474')?.id;
 assert.ok(id);
 const payload={kind:'saida' as const,quantity:1,employee:id,machine:'ROMI',work:'OBRA 1',part:'Eixo',note:''};
 const afterFirst=applyCommand(state,{type:'movement',payload:{...payload,code:'F1'}});
 const afterSecond=applyCommand(afterFirst,{type:'movement',payload:{...payload,code:'F2'}});
 assert.equal(afterSecond.movements.length,2);
 assert.ok(afterSecond.movements.every(m=>m.employee==='0001'));
});
