import type {Item} from './domain';

// Código pode conter zeros à esquerda, então nunca deve ser transformado em número.
// A correspondência precisa ser completa: códigos parcialmente digitados não autorizam saídas.
export function findInsertoByCode(items:readonly Item[],typedCode:string):Item|undefined{
 const normalized=typedCode.trim().toLocaleLowerCase('pt-BR');
 if(!normalized)return undefined;
 return items.find(item=>item.code.trim().toLocaleLowerCase('pt-BR')===normalized);
}
