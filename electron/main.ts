import {app,BrowserWindow,ipcMain,dialog} from 'electron';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir,readFile,readdir,rename,stat,unlink,writeFile} from 'node:fs/promises';
import {Store} from './store';
import {backupSchema} from '../shared/domain';
import {buildReport,reportFiltersSchema} from '../shared/report';
import {generatePdfHtml,generateXlsx} from './reportFiles';
import {parseCatalogCsv,type ImportKind} from '../shared/importCsv';

let store:Store;
const dev=!app.isPackaged&&process.argv.includes('--dev');
const target=dev?'http://127.0.0.1:5173/':pathToFileURL(path.join(__dirname,'../../dist/index.html')).href;
const MAX_BACKUP_BYTES=32*1024*1024;
// Cópia local diária rotativa, sem depender de internet. Também pode exportar manualmente.
// A gravação temporária + rename evita deixar um backup JSON pela metade.
async function dailyBackup(){
 const dir=path.join(app.getPath('userData'),'backups');
 await mkdir(dir,{recursive:true});
 const today=new Date().toISOString().slice(0,10);
 const filename=`backup-automatico-${today}.json`;
 const target=path.join(dir,filename),temporary=path.join(dir,`.${filename}.tmp`);
 const backup=JSON.stringify({version:1,exportedAt:new Date().toISOString(),state:store.read()},null,2);
 try{await writeFile(temporary,backup,'utf8');await rename(temporary,target);}
 catch(error){await unlink(temporary).catch(()=>{});throw error;}
 const backups=(await readdir(dir)).filter(name=>/^backup-automatico-\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().reverse();
 for(const old of backups.slice(7))await unlink(path.join(dir,old));
}
let backupQueue=Promise.resolve();
async function bestEffortBackup(){backupQueue=backupQueue.then(dailyBackup).catch(error=>{console.error('Backup automático indisponível:',error);});await backupQueue;}

function createWindow(){
 const win=new BrowserWindow({icon:path.join(__dirname,'../../assets/app-icon.png'),width:1440,height:960,minWidth:820,minHeight:620,backgroundColor:'#f4f6f9',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(event,url)=>{if(url!==target)event.preventDefault();});
 win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 void win.loadURL(target);
}
async function exportBackup(){
 const result=await dialog.showSaveDialog({defaultPath:`ferramentaria-backup-${new Date().toISOString().slice(0,10)}.json`,filters:[{name:'Backup JSON',extensions:['json']}]});
 if(result.canceled||!result.filePath)return false;
 await writeFile(result.filePath,JSON.stringify({version:1,exportedAt:new Date().toISOString(),state:store.read()},null,2),'utf8');
 return true;
}
async function importBackup(){
 const choose=await dialog.showOpenDialog({title:'Escolher backup da Ferramentaria',properties:['openFile'],filters:[{name:'Backup JSON',extensions:['json']}]});
 if(choose.canceled||!choose.filePaths[0])return null;
 const file=choose.filePaths[0];
 const meta=await stat(file);
 if(meta.size>MAX_BACKUP_BYTES)throw Error('Arquivo maior que 32 MB. Não foi importado.');
 const raw=await readFile(file,'utf8');
 if(Buffer.byteLength(raw,'utf8')>MAX_BACKUP_BYTES)throw Error('Arquivo maior que 32 MB. Não foi importado.');
 let parsed:unknown;
 try{parsed=JSON.parse(raw);}catch{throw Error('O arquivo selecionado não é um JSON válido.');}
 // Validar integralmente antes de confirmar ou gravar.
 const validated=backupSchema.safeParse(parsed);
 if(!validated.success)throw Error('Backup incompatível ou inválido. Nenhum dado foi alterado.');
 const confirmation=await dialog.showMessageBox({
  type:'warning',title:'Restaurar backup',
  message:'Substituir todos os dados locais pelo backup escolhido?',
  detail:`O arquivo contém ${validated.data.state.items.length} insertos, ${validated.data.state.employees.length} funcionários e ${validated.data.state.movements.length} movimentações. Uma cópia de recuperação da base atual será salva automaticamente.`,
  buttons:['Cancelar','Restaurar backup'],defaultId:0,cancelId:0,noLink:true
 });
 if(confirmation.response!==1)return null;
 const recoveryDir=path.join(app.getPath('userData'),'backups');
 await mkdir(recoveryDir,{recursive:true});
 const recoveryFile=path.join(recoveryDir,`antes-da-restauracao-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
 await writeFile(recoveryFile,JSON.stringify({version:1,exportedAt:new Date().toISOString(),state:store.read()},null,2),'utf8');
 return store.restore(validated.data);
}


async function importCsv(kind:ImportKind){
 if(kind!=='items'&&kind!=='employees')throw Error('Tipo de importação desconhecido.');
 const choose=await dialog.showOpenDialog({title:kind==='items'?'Importar insertos do CSV':'Importar funcionários do CSV',properties:['openFile'],filters:[{name:'Planilha CSV (UTF-8)',extensions:['csv']}]});
 if(choose.canceled||!choose.filePaths[0])return null;
 const file=choose.filePaths[0];
 const meta=await stat(file);
 if(meta.size>5*1024*1024)throw Error('CSV maior que 5 MB. Divida o arquivo.');
 const raw=await readFile(file,'utf8');
 const rows=parseCatalogCsv(raw,kind);
 const confirmation=await dialog.showMessageBox({
  type:'question',title:'Confirmar importação CSV',
  message:`Importar ${rows.length} ${kind==='items'?'insertos':'funcionários'} para o banco local?`,
  detail:'Os cadastros existentes serão mantidos. Se houver código/ID/SSO duplicado ou um registro inválido, nenhuma linha será gravada. Faça um backup antes de importar.',
  buttons:['Cancelar','Importar cadastros'],defaultId:0,cancelId:0,noLink:true
 });
 if(confirmation.response!==1)return null;
 return store.command(kind==='items'?{type:'import:items',payload:rows as import('../shared/domain').Item[]}:{type:'import:employees',payload:rows as import('../shared/domain').Employee[]});
}


async function exportReport(payload:unknown){
 const input=(payload&&typeof payload==='object'?payload:{}) as {format?:unknown,filters?:unknown};
 if(input.format!=='pdf'&&input.format!=='xlsx')throw Error('Formato de relatório inválido.');
 const filters=reportFiltersSchema.parse(input.filters);
 // Ler a base no processo principal evita exportar registros alterados no renderer.
 const state=store.read();
 const report=buildReport(state,filters);
 const ext=input.format;
 const file=await dialog.showSaveDialog({
  title:ext==='pdf'?'Exportar relatório PDF':'Exportar planilha Excel',
  defaultPath:`ferramentaria-relatorio-${new Date().toISOString().slice(0,10)}.${ext}`,
  filters:[{name:ext==='pdf'?'Documento PDF':'Planilha Excel',extensions:[ext]}]
 });
 if(file.canceled||!file.filePath)return false;
 if(ext==='xlsx'){
  await writeFile(file.filePath,generateXlsx(state,report));
  return true;
 }
 const html=generatePdfHtml(state,report);
 const reportWindow=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 try{
  reportWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  reportWindow.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  await reportWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
  const pdf=await reportWindow.webContents.printToPDF({printBackground:true,pageSize:'A4',landscape:false});
  await writeFile(file.filePath,pdf);
  return true;
 }finally{if(!reportWindow.isDestroyed())reportWindow.destroy();}
}

app.whenReady().then(()=>{
 store=new Store(path.join(app.getPath('userData'),'ferramentaria.sqlite'));
 void bestEffortBackup();
 for(const channel of ['data:read','data:command','data:export','data:import','data:import-csv','data:report']){
  ipcMain.handle(channel,async(event,payload)=>{
   if(event.senderFrame!==event.sender.mainFrame||event.senderFrame?.url!==target)throw Error('Origem não permitida.');
   try{
    if(channel==='data:read')return {ok:true,data:store.read()};
    if(channel==='data:command'){const data=store.command(payload);await bestEffortBackup();return {ok:true,data};}
    if(channel==='data:export')return {ok:true,data:await exportBackup()};
    if(channel==='data:import'){const data=await importBackup();if(data)await bestEffortBackup();return {ok:true,data};}
    if(channel==='data:report')return {ok:true,data:await exportReport(payload)};
    const data=await importCsv(payload);if(data)await bestEffortBackup();return {ok:true,data};
   }catch(error){return {ok:false,error:error instanceof Error?error.message:'Não foi possível concluir a operação.'};}
  });
 }
 createWindow();
 app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('will-quit',()=>store?.close());
