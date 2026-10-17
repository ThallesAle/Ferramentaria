import test from 'node:test';
import assert from 'node:assert/strict';
import {findInsertoByCode} from '../shared/insertoLookup';
import type {Item} from '../shared/domain';

const catalog:Item[]=[
 {code:'F2018494',description:'ROMX2006M08-D57',stock:18,min:3,location:'A-01'},
 {code:'000123',description:'Inserto com zeros à esquerda',stock:5,min:1,location:'A-02'},
];
test('Código digitado localiza a descrição no cadastro',()=>{
 assert.equal(findInsertoByCode(catalog,'F2018494')?.description,'ROMX2006M08-D57');
 assert.equal(findInsertoByCode(catalog,'f2018494')?.stock,18);
 assert.equal(findInsertoByCode(catalog,'  F2018494  ')?.description,'ROMX2006M08-D57');
});
test('Não admite código parcial ou não cadastrado',()=>{
 assert.equal(findInsertoByCode(catalog,'F2018'),undefined);
 assert.equal(findInsertoByCode(catalog,'inexistente'),undefined);
 assert.equal(findInsertoByCode(catalog,''),undefined);
});
test('Preserva zeros à esquerda dos códigos',()=>{
 assert.equal(findInsertoByCode(catalog,'000123')?.description,'Inserto com zeros à esquerda');
 assert.equal(findInsertoByCode(catalog,'123'),undefined);
});
