import {DatabaseSync} from 'node:sqlite';
import {applyCommand,backupSchema,emptyState,type State,type Command} from '../shared/domain';

// Um snapshot transacional da Fase 1 continua compatível com a nova versão.
// A restauração de backup substitui o snapshot todo em uma única transação.
export class Store{
 private db:DatabaseSync;
 constructor(filePath:string){
  this.db=new DatabaseSync(filePath);
  this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, data TEXT NOT NULL)');
  this.db.prepare('INSERT OR IGNORE INTO app_state VALUES (1,1,?)').run(JSON.stringify(emptyState()));
 }
 read():State{
  const saved=JSON.parse((this.db.prepare('SELECT data FROM app_state WHERE id=1').get() as {data:string}).data) as Partial<State>;
  // Bases das Fases 1/2 não possuíam os cadastros de máquinas e obras.
  return {...emptyState(),...saved,machines:saved.machines??[],works:saved.works??[],parts:saved.parts??[]};
 }
 private replace(next:State):State{
  this.db.exec('BEGIN IMMEDIATE');
  try{
   this.db.prepare('UPDATE app_state SET data=? WHERE id=1').run(JSON.stringify(next));
   this.db.exec('COMMIT');
   return next;
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 command(command:Command):State{
  // Evita perder alterações se dois comandos forem processados próximos.
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const next=applyCommand(this.read(),command);
   this.db.prepare('UPDATE app_state SET data=? WHERE id=1').run(JSON.stringify(next));
   this.db.exec('COMMIT');
   return next;
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 restore(raw:unknown):State{
  const data=backupSchema.parse(raw);
  return this.replace(data.state);
 }
 close(){this.db.close();}
}
