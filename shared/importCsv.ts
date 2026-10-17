import {employeeSchema,itemSchema,type Employee,type Item} from './domain';

export type ImportKind='items'|'employees';
const normalize=(s:string)=>s.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[_-]/g,' ').replace(/\s+/g,' ');
const aliases:Record<string,string[]>={
 code:['codigo','cod','codigo do inserto','inserto'],description:['descricao','descricao do inserto'],
 stock:['saldo','quantidade','estoque','saldo inicial'],min:['minimo','estoque minimo','min'],
 location:['localizacao','local','endereco','posicao'],
 id:['id','id do funcionario','matricula'],sso:['sso'],name:['nome','nome completo','funcionario'],area:['area','setor']
};
function delimiterOf(source:string):string{
 const firstLine=source.replace(/^\uFEFF/,'').split(/\r?\n/,1)[0];
 const options=[';',',','\t'];
 const counts=options.map(ch=>{let total=0,quoted=false;for(let i=0;i<firstLine.length;i++){
  if(firstLine[i]==='"'){if(quoted&&firstLine[i+1]==='"'){i++;continue;}quoted=!quoted;}
  else if(!quoted&&firstLine[i]===ch)total++;
 }return total;});
 return options[counts.indexOf(Math.max(...counts))];
}
// Leitura de CSV com separadores comuns e campos entre aspas, inclusive com quebras de linha.
export function parseCsv(source:string):string[][]{
 const text=source.replace(/^\uFEFF/,'');
 const sep=delimiterOf(text),rows:string[][]=[];
 let row:string[]=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(ch==='"'){
   if(quoted&&text[i+1]==='"'){field+='"';i++;}
   else if(quoted)quoted=false;
   else if(field==='')quoted=true;
   else throw Error('CSV inválido: aspas em posição inesperada.');
  }else if(ch===sep&&!quoted){row.push(field.trim());field='';}
  else if((ch==='\n'||ch==='\r')&&!quoted){
   if(ch==='\r'&&text[i+1]==='\n')i++;
   row.push(field.trim());field='';
   if(row.some(value=>value!==''))rows.push(row);
   row=[];
  }else field+=ch;
 }
 if(quoted)throw Error('CSV inválido: aspas não fechadas.');
 row.push(field.trim());if(row.some(value=>value!==''))rows.push(row);
 return rows;
}
export function parseCatalogCsv(source:string,kind:ImportKind):Item[]|Employee[]{
 const rows=parseCsv(source);
 if(rows.length<2)throw Error('CSV vazio ou sem registros. Inclua uma linha de cabeçalho.');
 if(rows.length>10001)throw Error('Importação limitada a 10.000 registros por arquivo.');
 const headers=rows[0].map(normalize);
 const fields=kind==='items'?['code','description','stock','min','location']:['id','sso','name','area'];
 const indices=Object.fromEntries(fields.map(field=>{
  const index=headers.findIndex(head=>aliases[field].some(name=>normalize(name)===head));
  if(index<0)throw Error(`Coluna obrigatória ausente: ${aliases[field][0]}. Confira o modelo de CSV.`);
  return [field,index];
 })) as Record<string,number>;
 const parsed:unknown[]=[];
 for(let i=1;i<rows.length;i++){
  const row=rows[i];
  if(row.length!==headers.length)throw Error(`Linha ${i+1}: quantidade de colunas diferente do cabeçalho.`);
  const get=(field:string)=>row[indices[field]];
  let entry:unknown;
  if(kind==='items'){
   const n=(field:string)=>{
    const str=get(field);
    if(!/^\d+$/.test(str))throw Error(`Linha ${i+1}: ${field} deve ser um número inteiro não negativo.`);
    return Number(str);
   };
   entry={code:get('code'),description:get('description'),stock:n('stock'),min:n('min'),location:get('location')};
  }else entry={id:get('id'),sso:get('sso'),name:get('name'),area:get('area')};
  const result=(kind==='items'?itemSchema:employeeSchema).safeParse(entry);
  if(!result.success)throw Error(`Linha ${i+1}: campos inválidos ou faltando. Confira os valores.`);
  parsed.push(result.data);
 }
 return kind==='items'?parsed as Item[]:parsed as Employee[];
}
