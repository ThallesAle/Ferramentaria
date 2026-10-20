import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateRawSync} from 'node:zlib';
import {emptyState,type Movement} from '../shared/domain';
import {buildReport,initialReportFilters,localDateKey,reportFiltersSchema,movementStatus} from '../shared/report';
import {generatePdfHtml,generateXlsx} from '../electron/reportFiles';

// XLSX é um arquivo ZIP: os nomes de abas ficam em xl/workbook.xml, comprimido.
// Ler os bytes diretamente com Buffer.includes() dá falso negativo.
function xlsxXmlEntry(buffer:Buffer,wanted:string):string{
 let pos=0;
 while(pos+30<=buffer.length&&buffer.readUInt32LE(pos)===0x04034b50){
  const method=buffer.readUInt16LE(pos+8);
  const compressedSize=buffer.readUInt32LE(pos+18);
  const rawSize=buffer.readUInt32LE(pos+22);
  const nameLength=buffer.readUInt16LE(pos+26);
  const extraLength=buffer.readUInt16LE(pos+28);
  const dataStart=pos+30+nameLength+extraLength;
  const dataEnd=dataStart+compressedSize;
  assert.ok(dataEnd<=buffer.length,'Arquivo XLSX truncado');
  const name=buffer.toString('utf8',pos+30,pos+30+nameLength);
  if(name===wanted){
   assert.equal(method,8,'O gerador XLSX deve usar DEFLATE');
   const raw=inflateRawSync(buffer.subarray(dataStart,dataEnd));
   assert.equal(raw.length,rawSize,`Tamanho inválido de ${wanted}`);
   return raw.toString('utf8');
  }
  pos=dataEnd;
 }
 assert.fail(`Entrada ${wanted} ausente do XLSX`);
}
const at=(year:number,month:number,day:number)=>new Date(year,month-1,day,10,30).toISOString();
function fixture(){
 const state=emptyState();
 state.brand='Teste Ferramentaria';
 state.items=[{code:'A001',description:'Inserto <valioso>',stock:7,min:10,location:'G-1'},{code:'A002',description:'Fresa',stock:20,min:4,location:'G-2'}];
 state.employees=[{id:'0001',sso:'100',name:'Ana & Pedro',area:'Usinagem'}];
 state.machines=['Torno 1','Centro 2'];state.works=['Obra A','Obra B'];state.parts=['Eixo M-10','Flange'];
 const make=(id:string,date:string,kind:'entrada'|'saida',code:string,quantity:number,machine:string,work:string,reversalOf?:string):Movement=>({id,date,kind,code,quantity,machine,work,employee:'0001',part:code==='A001'?'Eixo M-10':'Flange',note:'',...(reversalOf?{reversalOf}:{})});
 state.movements=[
  make('in',at(2026,10,10),'entrada','A001',20,'Torno 1','Obra A'),
  make('out',at(2026,10,11),'saida','A001',5,'Torno 1','Obra A'),
  make('out2',at(2026,10,12),'saida','A001',3,'Centro 2','Obra B'),
  make('reverse',at(2026,11,2),'entrada','A001',3,'Centro 2','Obra B','out2'),
  make('out3',at(2026,10,15),'saida','A002',4,'Torno 1','Obra A')
 ];
 return state;
}
const period={from:'2026-10-01',to:'2026-10-31',code:'',machine:'',work:'',part:'',employee:'',kind:'todos'} as const;
test('filtro outubro: consumo líquido ignora saída estornada em novembro, preserva extrato',()=>{
 const state=fixture(),report=buildReport(state,{...period});
 assert.equal(report.exitUnits,9);assert.equal(report.exitRecords,2);assert.equal(report.entryUnits,20);
 assert.equal(report.totalRecords,4);assert.equal(report.reversedRecords,1);
 assert.equal(report.machinesServed,1);assert.equal(report.employeesServed,1);assert.equal(report.lowItems,1);
 assert.deepEqual(report.byCode.map(r=>[r.name,r.quantity]),[['A001 — Inserto <valioso>',5],['A002 — Fresa',4]]);
 assert.equal(report.byMachine[0].quantity,9);
 assert.equal(movementStatus(state.movements[2],new Set(['out2'])),'Estornada');
});
test('combinação de filtros por máquina, inserto e tipo',()=>{
 const state=fixture();
 const r=buildReport(state,{...period,machine:'Torno 1',code:'A001',kind:'saida'});
 assert.equal(r.exitUnits,5);assert.equal(r.entryUnits,0);assert.equal(r.totalRecords,1);
 const empty=buildReport(state,{...period,work:'Sem obra'});
 assert.equal(empty.exitUnits,0);assert.equal(empty.totalRecords,0);
});
test('datas locais e intervalos inválidos',()=>{
 assert.equal(localDateKey(at(2026,10,15)),'2026-10-15');
 assert.equal(initialReportFilters(new Date(2026,9,15,12)).from,'2026-10-01');
 assert.equal(reportFiltersSchema.safeParse({...period,from:'2026-12-01',to:'2026-10-01'}).success,false);
});
test('Excel gera planilha OpenXML e PDF escapa valores de insertos',()=>{
 const state=fixture(),report=buildReport(state,{...period});
 const excel=generateXlsx(state,report),pdf=generatePdfHtml(state,report);
 assert.equal(excel.readUInt32LE(0),0x04034b50);
 assert.ok(excel.length>1500);
 assert.match(pdf,/Inserto/);assert.match(pdf,/Relatório operacional/);
 assert.ok(!pdf.includes('Inserto <valioso>'));
 assert.match(pdf,/Ana &amp; Pedro/);
 assert.match(pdf,/A001<\/td><td>Inserto &lt;valioso&gt;/);
 assert.match(xlsxXmlEntry(excel,'xl/worksheets/sheet4.xml'),/Inserto &lt;valioso&gt;/);
});

test('Fase 5: filtrar por peça e preservar peça em saídas estornadas',()=>{
 const state=fixture();
 const all=buildReport(state,{...period});
 assert.deepEqual(all.byPart.map(r=>[r.name,r.quantity]),[['Eixo M-10',5],['Flange',4]]);
 const filtered=buildReport(state,{...period,part:'Eixo M-10'});
 assert.equal(filtered.exitUnits,5);
 assert.equal(filtered.totalRecords,3); // entrada, saída ativa, saída estornada
 assert.equal(filtered.byPart[0].name,'Eixo M-10');
 assert.equal(buildReport(state,{...period,part:'Não cadastrada'}).exitUnits,0);
 const pdf=generatePdfHtml(state,filtered);
 assert.match(pdf,/Peça/);
 assert.match(pdf,/Eixo M-10/);
 const xlsx=generateXlsx(state,filtered);
 assert.equal(xlsx.readUInt32LE(0),0x04034b50);
 assert.match(xlsxXmlEntry(xlsx,'xl/workbook.xml'),/<sheet name="Pecas"/);
 assert.match(xlsxXmlEntry(xlsx,'xl/worksheets/sheet7.xml'),/Eixo M-10/);
});


test('v1.0.1: o extrato PDF e o Excel agrupam Peça / Obra ao lado de Máquina',()=>{
 const state=fixture(),report=buildReport(state,{...period});
 const pdf=generatePdfHtml(state,report);
 assert.match(pdf,/<th>Máquina<\/th><th>Peça \/ Obra<\/th>/);
 assert.match(pdf,/Peça: Eixo M-10<br\/>Obra: Obra A/);
 const xlsx=generateXlsx(state,report);
 assert.match(xlsxXmlEntry(xlsx,'xl/workbook.xml'),/<sheet name="Movimentacoes"/);
 assert.match(xlsxXmlEntry(xlsx,'xl/worksheets/sheet2.xml'),/Peça: Eixo M-10 \| Obra: Obra A/);
 assert.match(xlsxXmlEntry(xlsx,'xl/workbook.xml'),/<sheet name="Pecas"/);
 assert.match(xlsxXmlEntry(xlsx,'xl/worksheets/sheet7.xml'),/Eixo M-10/);
});
