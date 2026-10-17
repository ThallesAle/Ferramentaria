import {deflateRawSync} from 'node:zlib';
import type {State,Movement} from '../shared/domain';
import {type Report,movementStatus,type Ranking} from '../shared/report';

const clean=(value:unknown)=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,32767);
const xml=(v:unknown)=>clean(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const date=(iso:string)=>new Date(iso).toLocaleString('pt-BR');
type Value=string|number;
type Sheet={name:string,rows:Value[][]};
function auditRows(state:State,report:Report):Value[][]{
 const reversed=new Set(state.movements.flatMap(m=>m.reversalOf?[m.reversalOf]:[]));
 const itemNames=new Map(state.items.map(i=>[i.code,i.description]));
 const employeeNames=new Map(state.employees.map(e=>[e.id,e.name]));
 return [
  ['Data e hora','Tipo','Situação','Código','Descrição','Quantidade','Funcionário ID','Funcionário','Máquina','Peça / Obra','Observação','ID movimento','Estorno de'],
  ...report.allMovements.map(m=>[date(m.date),m.kind==='entrada'?'Entrada':'Saída',movementStatus(m,reversed),m.code,itemNames.get(m.code)||'',m.quantity,m.employee,employeeNames.get(m.employee)||'',m.machine,`Peça: ${m.part||'—'} | Obra: ${m.work||'—'}`,m.note,m.id,m.reversalOf||''] as Value[])
 ];
}
function rankRows(heading:string,rankings:Ranking[]):Sheet{return {name:heading,rows:[['Posição','Nome','Unidades consumidas','Retiradas'],...rankings.map((r,i)=>[i+1,r.name,r.quantity,r.records])]};}
function sheets(state:State,report:Report):Sheet[]{
 const f=report.filters;
 return [
  {name:'Resumo',rows:[['Relatório de ferramentaria',''],['Emitido em',date(report.generatedAt)],['Data inicial',f.from||'Todo o histórico'],['Data final',f.to||'Todo o histórico'],['Tipo',f.kind],['Código',f.code||'Todos'],['Máquina',f.machine||'Todas'],['Obra',f.work||'Todas'],['Peça',f.part||'Todas'],['Funcionário ID',f.employee||'Todos'],['',''],['Indicador','Valor'],['Unidades consumidas',report.exitUnits],['Unidades recebidas',report.entryUnits],['Saídas válidas',report.exitRecords],['Entradas válidas',report.entryRecords],['Movimentos no extrato',report.totalRecords],['Movimentos de estorno / estornados',report.reversedRecords],['Máquinas atendidas',report.machinesServed],['Funcionários atendidos',report.employeesServed],['Saldo atual geral (sem filtro)',report.stockUnits],['Insertos a repor (sem filtro)',report.lowItems],['',''],['Método','Movimentos estornados são retirados retroativamente dos indicadores, mas permanecem no extrato.']]},
  {name:'Movimentacoes',rows:auditRows(state,report)},
  {name:'Tendencia',rows:[['Período','Unidades consumidas','Saídas válidas'],...report.trend.map(p=>[p.label,p.quantity,p.records])]},
  rankRows('Insertos',report.byCode),rankRows('Maquinas',report.byMachine),rankRows('Obras',report.byWork),rankRows('Pecas',report.byPart),rankRows('Funcionarios',report.byEmployee),
  {name:'Estoque atual',rows:[['Código','Descrição','Saldo','Mínimo','Localização','Situação'],...state.items.map(i=>[i.code,i.description,i.stock,i.min,i.location,i.stock===0?'Esgotado':i.stock<=i.min?'Repor':'Normal'])]}
 ];
}
function sheetXml(rows:Value[][]){
 const rowXml=rows.map((cells,index)=>`<row r="${index+1}">${cells.map((cell,j)=>{
  let n=j+1,letter='';while(n){n--;letter=String.fromCharCode(65+n%26)+letter;n=Math.floor(n/26);}
  return typeof cell==='number'&&Number.isFinite(cell)?`<c r="${letter}${index+1}"><v>${cell}</v></c>`:
   `<c r="${letter}${index+1}" t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`;
 }).join('')}</row>`).join('');
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="16"/><cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="4" width="27" customWidth="1"/><col min="5" max="14" width="21" customWidth="1"/></cols><sheetData>${rowXml}</sheetData></worksheet>`;
}
function crc32(buf:Buffer){let crc=-1;for(const b of buf){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^(crc&1?0xedb88320:0);}return (crc^-1)>>>0;}
function dosTime(date=new Date()){return (date.getHours()<<11)|(date.getMinutes()<<5)|Math.floor(date.getSeconds()/2);}
function dosDate(date=new Date()){return ((Math.max(1980,date.getFullYear())-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();}
// ZIP simples padrão OpenXML, sem bibliotecas externas ou macros.
export function zipEntries(files:{name:string,data:string}[]):Buffer{
 const locals:Buffer[]=[],centrals:Buffer[]=[];
 let offset=0;
 for(const file of files){
  const name=Buffer.from(file.name,'utf8'),raw=Buffer.from(file.data,'utf8'),data=deflateRawSync(raw),crc=crc32(raw);
  const loc=Buffer.alloc(30);loc.writeUInt32LE(0x04034b50,0);loc.writeUInt16LE(20,4);loc.writeUInt16LE(0x800,6);loc.writeUInt16LE(8,8);loc.writeUInt16LE(dosTime(),10);loc.writeUInt16LE(dosDate(),12);loc.writeUInt32LE(crc,14);loc.writeUInt32LE(data.length,18);loc.writeUInt32LE(raw.length,22);loc.writeUInt16LE(name.length,26);
  locals.push(loc,name,data);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(8,10);central.writeUInt16LE(dosTime(),12);central.writeUInt16LE(dosDate(),14);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(raw.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
  centrals.push(central,name);offset+=loc.length+name.length+data.length;
 }
 const centralSize=centrals.reduce((n,b)=>n+b.length,0);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,...centrals,end]);
}
export function generateXlsx(state:State,report:Report):Buffer{
 if(report.allMovements.length>50000)throw Error('O Excel permite até 50.000 movimentações por exportação. Ajuste o período.');
 const workSheets=sheets(state,report);
 const ns='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 const files=[
  {name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${workSheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`},
  {name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
  {name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${ns}"><sheets>${workSheets.map((sheet,i)=>`<sheet name="${xml(sheet.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`},
  {name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workSheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="${ns}/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}</Relationships>`},
  ...workSheets.map((sheet,i)=>({name:`xl/worksheets/sheet${i+1}.xml`,data:sheetXml(sheet.rows)}))
 ];
 return zipEntries(files);
}
function rankingHtml(title:string,rows:Ranking[]){return `<section><h2>${xml(title)}</h2><table><thead><tr><th>Posição</th><th>Descrição</th><th>Unidades</th><th>Saídas</th></tr></thead><tbody>${rows.slice(0,10).map((r,i)=>`<tr><td>${i+1}</td><td>${xml(r.name)}</td><td>${r.quantity}</td><td>${r.records}</td></tr>`).join('')||'<tr><td colspan="4">Sem movimentações</td></tr>'}</tbody></table></section>`;}
export function generatePdfHtml(state:State,report:Report){
 const f=report.filters,reversed=new Set(state.movements.flatMap(m=>m.reversalOf?[m.reversalOf]:[]));
 const details=report.allMovements.slice(0,100);
 const people=new Map(state.employees.map(e=>[e.id,e.name]));
 return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Relatório de ferramentaria</title><style>@page{size:A4;margin:17mm 14mm}body{font:11px Arial,sans-serif;color:#263b4a;margin:0}header{border-bottom:3px solid #168478;padding-bottom:15px;margin-bottom:20px}h1{font-size:22px;margin:0}h2{font-size:14px;margin:20px 0 10px}p{color:#617481}.filters{background:#eff6f5;padding:12px;line-height:1.8;margin-bottom:15px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.stat{border:1px solid #dce8e6;padding:12px}.stat b{display:block;font-size:20px;color:#137368;margin-top:5px}table{border-collapse:collapse;width:100%;font-size:9px}th{background:#e9f1f2;text-align:left}th,td{padding:7px 6px;border-bottom:1px solid #e1e9ed;vertical-align:top;overflow-wrap:anywhere}section{break-inside:avoid}tr{break-inside:avoid}.note{font-size:9px;color:#777;margin-top:14px}.detail{break-before:page}footer{font-size:9px;color:#8b9ba4;margin-top:20px}</style></head><body><header><h1>${xml(state.brand)} · Relatório operacional</h1><p>Emitido em ${xml(date(report.generatedAt))} • Base local, sem sincronização</p></header><div class="filters"><strong>Período:</strong> ${xml(f.from||'Início')} a ${xml(f.to||'Fim')} &nbsp; <strong>Tipo:</strong> ${xml(f.kind)}<br/><strong>Inserto:</strong> ${xml(f.code||'Todos')} &nbsp; <strong>Máquina:</strong> ${xml(f.machine||'Todas')} &nbsp; <strong>Obra:</strong> ${xml(f.work||'Todas')} &nbsp; <strong>Funcionário ID:</strong> ${xml(f.employee||'Todos')} &nbsp; <strong>Peça:</strong> ${xml(f.part||'Todas')}</div><div class="stats"><div class="stat">Consumo<b>${report.exitUnits}</b>unidades</div><div class="stat">Abastecimento<b>${report.entryUnits}</b>unidades</div><div class="stat">Saídas válidas<b>${report.exitRecords}</b>operações</div><div class="stat">Máquinas atendidas<b>${report.machinesServed}</b>máquinas</div></div><p class="note">O consumo é líquido de estornos: movimentações canceladas não entram nas métricas. No histórico, permanecem visíveis para auditoria. Saldo atual e alertas não representam a posição histórica do período.</p>${rankingHtml('Insertos mais consumidos',report.byCode)}${rankingHtml('Consumo por máquina',report.byMachine)}${rankingHtml('Consumo por obra',report.byWork)}${rankingHtml('Consumo por peça',report.byPart)}${rankingHtml('Consumo por funcionário',report.byEmployee)}<section class="detail"><h2>Extrato de movimentações (${Math.min(details.length,100)} de ${report.totalRecords})</h2><table><thead><tr><th>Data</th><th>Tipo</th><th>Estado</th><th>Inserto</th><th>Qtd.</th><th>Funcionário</th><th>Máquina</th><th>Peça / Obra</th></tr></thead><tbody>${details.map(m=>`<tr><td>${xml(date(m.date))}</td><td>${xml(m.kind)}</td><td>${movementStatus(m,reversed)}</td><td>${xml(m.code)}</td><td>${m.quantity}</td><td>${xml(people.get(m.employee)||m.employee)}</td><td>${xml(m.machine)}</td><td>Peça: ${xml(m.part||'—')}<br/>Obra: ${xml(m.work||'—')}</td></tr>`).join('')||'<tr><td colspan="8">Nenhum registro para os filtros selecionados</td></tr>'}</tbody></table></section><footer>${report.totalRecords>100?'O PDF mostra até 100 movimentos; exporte Excel para o extrato completo.':'Extrato completo para o filtro selecionado.'}</footer></body></html>`;
}
