export const API='/api/trail-search';
function json(res,status,value){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));}
async function readBody(req){
  let size=0;const chunks=[];
  for await(const part of req){const bytes=Buffer.from(part);size+=bytes.length;if(size>256*1024)throw Object.assign(new Error('请求超过 256 KB'),{status:413});chunks.push(bytes);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('JSON 格式错误');}
}
function verifyOrigin(req){
  if(!req.headers.origin)return;
  let authority;try{authority=new URL(req.headers.origin).host;}catch{throw Object.assign(new Error('origin rejected'),{status:403});}
  if(authority!==req.headers.host)throw Object.assign(new Error('origin rejected'),{status:403});
}
export function createHttpTransport(ctx,control){
  return async(req,res)=>{
    try{
      if(!ctx.connection.isTrusted(req))return json(res,403,{error:'forbidden'});
      if(!ctx.connection.authorizeIndex(req,res))return;
      const url=new URL(req.url,'http://localhost');
      if(req.method==='GET'){
        const action=url.searchParams.get('action')??'state';let result;
        if(action==='config')result=control.settings.current();
        else if(action==='result')result=await control.result(url.searchParams.get('trailId'),url.searchParams.get('nodeId'));
        else if(action==='state')result=await control.state(url.searchParams.get('sessionId')||undefined,url.searchParams.get('trailId')||undefined);
        else throw new Error('未知读取操作');
        return json(res,200,result);
      }
      if(req.method!=='POST')return json(res,405,{error:'method not allowed'});
      if(!String(req.headers['content-type']??'').toLowerCase().startsWith('application/json'))return json(res,415,{error:'需要 application/json'});
      verifyOrigin(req);return json(res,200,await control.action(await readBody(req)));
    }catch(error){return json(res,error.status??400,{error:error.message??'线索操作失败'});}
  };
}
