const browserSave = (blob:Blob, filename:string) => {
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
export function downloadJson(filename:string,value:unknown,{save=browserSave}:{save?:(blob:Blob,filename:string)=>void}={}) {
  save(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),filename);
}
