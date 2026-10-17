import React,{type Dispatch,type SetStateAction} from 'react';
import {BarChart3,CalendarDays,Download,FileSpreadsheet,FileText,FilterX,TrendingUp,AlertCircle} from 'lucide-react';
import type {State,Movement} from '../shared/domain';
import {buildReport,initialReportFilters,localDateKey,movementStatus,type Ranking,type Report,type ReportFilters} from '../shared/report';

const fmt=(n:number)=>n.toLocaleString('pt-BR');
const shortDate=(iso:string)=>{const key=localDateKey(iso);return key?`${key.slice(8,10)}/${key.slice(5,7)}/${key.slice(0,4)}`:'—';};
export function RankingBars({rows,empty='Sem saídas para os filtros selecionados.',limit=6}:{rows:Ranking[],empty?:string,limit?:number}){
 const data=rows.slice(0,limit),max=Math.max(1,...data.map(r=>r.quantity));
 return <div className="bars report-bars">{data.map(row=><div key={row.name}><div className="bar-label"><span title={row.name}>{row.name}</span><strong>{fmt(row.quantity)} un.</strong></div><div className="track"><div style={{width:`${row.quantity/max*100}%`}}/></div></div>)}{!data.length&&<p className="empty">{empty}</p>}</div>;
}
export function TrendChart({report}:{report:Report}){
 const points=report.trend,max=Math.max(1,...points.map(p=>p.quantity));
 return <div className="trend-body"><div className="trend-bars" role="img" aria-label={`Evolução do consumo: ${points.map(p=>`${p.label}, ${p.quantity} unidades`).join('; ')||'Sem registros'}`}>
  {points.map(point=><div className="trend-column" key={point.label} title={`${point.label}: ${point.quantity} unidades em ${point.records} saídas`}>
   <span>{point.quantity?fmt(point.quantity):''}</span><div className="trend-track"><div style={{height:`${point.quantity/max*100}%`}}/></div><small>{point.label.length===10?point.label.slice(8,10)+'/'+point.label.slice(5,7):point.label}</small>
  </div>)}
  {!points.length&&<p className="empty">Ainda não há saídas válidas nesse período.</p>}
 </div><p className="chart-note">Consumo contabilizado por data da retirada; movimentações estornadas são excluídas.</p></div>;
}
const blank='';
export type ReportExports=(format:'pdf'|'xlsx')=>Promise<void>;
export function ReportsPage({state,filters,setFilters,onExport,disabled,busy}:{state:State,filters:ReportFilters,setFilters:Dispatch<SetStateAction<ReportFilters>>,onExport:ReportExports,disabled:boolean,busy:boolean}){
 const report=buildReport(state,filters);
 const change=(key:keyof ReportFilters,value:string)=>setFilters(prev=>({...prev,[key]:value}));
 const fields=(state.movements||[]);
 const machines=Array.from(new Set([...state.machines,...fields.map(m=>m.machine)])).filter(Boolean).sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const works=Array.from(new Set([...state.works,...fields.map(m=>m.work)])).filter(Boolean).sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const parts=Array.from(new Set([...state.parts,...fields.map(m=>m.part)])).filter(Boolean).sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const employeeNames=new Map(state.employees.map(e=>[e.id,e.name]));
 const reversedIds=new Set(state.movements.flatMap(m=>m.reversalOf?[m.reversalOf]:[]));
 const employeeIds=Array.from(new Set([...state.employees.map(e=>e.id),...fields.map(m=>m.employee)])).filter(Boolean).sort();
 return <>
  <section className="card report-filter-card"><div className="card-title"><div><h2><CalendarDays size={18}/> Filtros do relatório</h2><p>Combine critérios para analisar um período ou conjunto de movimentações.</p></div><button className="secondary" onClick={()=>setFilters({...initialReportFilters(),from:blank,to:blank})}><FilterX size={15}/> Todo o histórico</button></div>
   <div className="report-filters">
    <label>De<input type="date" value={filters.from} max={filters.to||undefined} onChange={e=>change('from',e.target.value)}/></label>
    <label>Até<input type="date" value={filters.to} min={filters.from||undefined} onChange={e=>change('to',e.target.value)}/></label>
    <label>Tipo<select value={filters.kind} onChange={e=>change('kind',e.target.value)}><option value="todos">Todos</option><option value="saida">Somente saídas</option><option value="entrada">Somente entradas</option></select></label>
    <label>Inserto<select value={filters.code} onChange={e=>change('code',e.target.value)}><option value="">Todos os insertos</option>{state.items.map(i=><option value={i.code} key={i.code}>{i.code}</option>)}</select></label>
    <label>Máquina<select value={filters.machine} onChange={e=>change('machine',e.target.value)}><option value="">Todas as máquinas</option>{machines.map(m=><option value={m} key={m}>{m}</option>)}</select></label>
    <label>Obra<select value={filters.work} onChange={e=>change('work',e.target.value)}><option value="">Todas as obras</option>{works.map(w=><option value={w} key={w}>{w}</option>)}</select></label>
    <label>Peça<select value={filters.part} onChange={e=>change('part',e.target.value)}><option value="">Todas as peças</option>{parts.map(part=><option value={part} key={part}>{part}</option>)}</select></label>
    <label>Funcionário<select value={filters.employee} onChange={e=>change('employee',e.target.value)}><option value="">Todos os funcionários</option>{employeeIds.map(id=><option value={id} key={id}>{employeeNames.get(id)||id} ({id})</option>)}</select></label>
   </div>
   <div className="report-toolbar"><span><BarChart3 size={15}/> {fmt(report.totalRecords)} movimentos encontrados • {fmt(report.reversedRecords)} registros de estorno / estornados</span><div className="report-actions"><button className="secondary" disabled={busy||disabled} title={disabled?'Abra a base local para exportar dados reais.':''} onClick={()=>void onExport('pdf')}><FileText size={17}/> Exportar PDF</button><button className="primary" disabled={busy||disabled} title={disabled?'Abra a base local para exportar dados reais.':''} onClick={()=>void onExport('xlsx')}><FileSpreadsheet size={17}/> Exportar Excel .xlsx <Download size={14}/></button></div></div>
  </section>
  <div className="stats report-stats">{[
   ['Unidades consumidas',report.exitUnits,`${report.exitRecords} retiradas válidas`],
   ['Unidades recebidas',report.entryUnits,`${report.entryRecords} abastecimentos válidos`],
   ['Máquinas atendidas',report.machinesServed,'Nas saídas filtradas'],
   ['Funcionários atendidos',report.employeesServed,'Nas saídas filtradas']
  ].map(([label,n,detail])=><section className="stat" key={label}><div className="stat-label">{label}<TrendingUp size={17}/></div><strong>{fmt(Number(n))}</strong><small>{detail}</small></section>)}</div>
  <div className="dashboard-grid report-grid"><section className="card trend-card"><div className="card-title"><div><h2>Consumo ao longo do tempo</h2><p>Tendência de retiradas no intervalo selecionado</p></div><span className="tag">HISTÓRICO</span></div><TrendChart report={report}/></section><section className="card"><div className="card-title"><div><h2>Insertos mais consumidos</h2><p>Ranking por quantidade de unidades</p></div></div><RankingBars rows={report.byCode}/></section><section className="card"><div className="card-title"><div><h2>Consumo por máquina</h2><p>Onde os insertos estão sendo utilizados</p></div></div><RankingBars rows={report.byMachine}/></section><section className="card"><div className="card-title"><div><h2>Consumo por obra</h2><p>Demanda separada por ordem/obra</p></div></div><RankingBars rows={report.byWork}/></section><section className="card"><div className="card-title"><div><h2>Consumo por peça</h2><p>Peças associadas às retiradas</p></div></div><RankingBars rows={report.byPart}/></section><section className="card"><div className="card-title"><div><h2>Consumo por funcionário</h2><p>Retiradas registradas por responsável</p></div></div><RankingBars rows={report.byEmployee}/></section><section className="card"><div className="card-title"><div><h2>Resumo de estoque atual</h2><p>Indicadores gerais, não históricos nem filtrados</p></div></div><div className="stock-report"><div><span>Unidades armazenadas</span><strong>{fmt(report.stockUnits)}</strong></div><div><span>Itens a repor</span><strong>{fmt(report.lowItems)}</strong></div><div><span>Tipos de insertos</span><strong>{fmt(state.items.length)}</strong></div></div></section></div>
  <section className="card report-extract"><div className="card-title"><div><h2>Extrato de movimentações</h2><p>Prévia de até 50 registros. A planilha Excel exporta até 50.000 registros por filtro.</p></div><span className="tag">AUDITORIA</span></div><div className="table-wrap"><table><thead><tr><th>Data</th><th>Inserto</th><th>Tipo</th><th>Status</th><th>Funcionário</th><th>Máquina</th><th>Peça / Obra</th><th className="right">Qtd.</th></tr></thead><tbody>{report.allMovements.slice(0,50).map((m:Movement)=><tr key={m.id}><td>{shortDate(m.date)}<small>{new Date(m.date).toLocaleTimeString('pt-BR')}</small></td><td><strong>{m.code}</strong></td><td>{m.kind==='entrada'?'Entrada':'Saída'}</td><td><span className={`status ${movementStatus(m,reversedIds)==='Ativa'?'':'warn'}`}>{movementStatus(m,reversedIds)}</span></td><td>{employeeNames.get(m.employee)||m.employee||'—'}</td><td>{m.machine||'—'}</td><td><strong>{m.part?`Peça: ${m.part}`:'Peça: —'}</strong><small>{`Obra: ${m.work||'—'}`}</small></td><td className="right mono">{fmt(m.quantity)}</td></tr>)}</tbody></table>{!report.allMovements.length&&<div className="empty">Nenhuma movimentação encontrada. Ajuste os filtros.</div>}</div></section>
  <p className="report-disclaimer"><AlertCircle size={15}/> Os indicadores excluem retroativamente movimentações estornadas, mas o extrato conserva as operações originais e seus estornos para auditoria. Não substitui a conferência física do estoque.</p>
 </>;
}
