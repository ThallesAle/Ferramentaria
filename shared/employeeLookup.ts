import type {Employee} from './domain';

// SSO é uma identificação textual: preserve zeros à esquerda, letras e espaços externos.
// A busca exige o SSO completo e não sugere funcionários diferentes enquanto o operador digita.
export function findEmployeeBySSO(employees:readonly Employee[],typedSSO:string):Employee|undefined{
 const normalized=typedSSO.trim().toLocaleLowerCase('pt-BR');
 if(!normalized)return undefined;
 return employees.find(employee=>employee.sso.trim().toLocaleLowerCase('pt-BR')===normalized);
}
