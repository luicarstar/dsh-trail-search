import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {budgetConfig} from './trail.js';
import {compileUserRules} from './sites-user.js';
const clone=value=>structuredClone(value);
async function read(path,fallback){try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw new Error('线索配置读取失败：'+error.message);}}
function configOf(input={}){
  const config={budget:budgetConfig(input.budget),blacklist:input.blacklist??[],browserAvailable:input.browserAvailable??null,harvestAvailable:input.harvestAvailable??null};
  if(!Array.isArray(config.blacklist)||config.blacklist.some(x=>typeof x!=='string'))throw new Error('blacklist 必须是字符串数组');
  for(const key of ['browserAvailable','harvestAvailable'])if(config[key]!==null&&typeof config[key]!=='boolean')throw new Error(key+' 必须是 boolean 或 null');
  return config;
}
export class TrailSettings {
  static async open(dataDir){const store=new TrailSettings(dataDir);store.config=configOf(await read(join(dataDir,'config.json'),{}));store.rules=await read(join(dataDir,'sites.user.json'),[]);compileUserRules(store.rules);return store;}
  constructor(dataDir){this.dataDir=dataDir;this.tail=Promise.resolve();}
  current(){return clone({config:this.config,rules:this.rules});}
  save({config=this.config,rules=this.rules}){
    const task=this.tail.then(async()=>{
      const next=configOf(config);compileUserRules(rules);
      await mkdir(this.dataDir,{recursive:true});
      await writeFile(join(this.dataDir,'sites.user.json'),JSON.stringify(rules,null,2)+'\n','utf8');
      await writeFile(join(this.dataDir,'config.json'),JSON.stringify(next,null,2)+'\n','utf8');
      this.config=next;this.rules=clone(rules);return this.current();
    });this.tail=task.catch(()=>{});return task;
  }
}
