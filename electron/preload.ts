import {contextBridge,ipcRenderer} from 'electron';
// API restrita: o renderer não tem acesso a SQL, sistema de arquivos ou canais arbitrários.
contextBridge.exposeInMainWorld('ferramentaria',{
 read:()=>ipcRenderer.invoke('data:read'),
 command:(command:unknown)=>ipcRenderer.invoke('data:command',command),
 export:()=>ipcRenderer.invoke('data:export'),
 import:()=>ipcRenderer.invoke('data:import'),
 importCsv:(kind:'items'|'employees')=>ipcRenderer.invoke('data:import-csv',kind),
 exportReport:(format:'pdf'|'xlsx',filters:unknown)=>ipcRenderer.invoke('data:report',{format,filters})
});
