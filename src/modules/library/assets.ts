import { supabase } from "@/lib/supabase";
import type { LibraryComplement, LibraryComplementTemplate, LibraryField, LibraryPhoto, LibraryTemplate } from "./model";

const bucket="library-product-images";

export async function listLibraryTemplates():Promise<LibraryTemplate[]> {
  const {data,error}=await supabase.from("library_config_templates")
    .select("id,name,category,fields,version,updated_at").order("name");
  if(error)throw error;
  return (data||[]) as LibraryTemplate[];
}

export async function saveLibraryTemplate(userId:string, name:string, category:string, fields:LibraryField[]):Promise<void> {
  if(!name.trim()||fields.length===0)throw new Error("Informe nome e campos para criar o modelo.");
  const {error}=await supabase.from("library_config_templates").insert({
    created_by:userId,name:name.trim(),category,fields
  });
  if(error)throw error;
}

export async function listLibraryComplements():Promise<LibraryComplementTemplate[]> {
  const {data,error}=await supabase.from("library_complement_catalog")
    .select("id,name,mode,visibility,when_condition,version,updated_at").order("name");
  if(error)throw error;
  return (data||[]).map(x=>({...x,when:x.when_condition})) as LibraryComplementTemplate[];
}

export async function saveLibraryComplement(userId:string, complement:LibraryComplement):Promise<void> {
  const {error}=await supabase.from("library_complement_catalog").insert({
    created_by:userId,name:complement.name.trim(),mode:complement.mode,
    visibility:complement.visibility,when_condition:complement.when,
  });
  if(error)throw error;
}

export const libraryPhotoUri=(path:string):string=>`storage://${bucket}/${path}`;

export function imagePathFromUri(uri:string):string|null {
  const prefix=`storage://${bucket}/`;
  if(!uri.startsWith(prefix))return null;
  const path=uri.slice(prefix.length);
  return /^[0-9a-f-]{36}\/[a-z0-9_.-]+$/i.test(path)?path:null;
}

export async function signedLibraryImageUrl(uri:string):Promise<string> {
  const path=imagePathFromUri(uri);
  if(!path) {
    if(/^https:\/\//i.test(uri))return uri;
    throw new Error("Imagem com endereço inválido.");
  }
  const {data,error}=await supabase.storage.from(bucket).createSignedUrl(path,3600);
  if(error||!data?.signedUrl)throw error||new Error("Não foi possível exibir esta imagem.");
  return data.signedUrl;
}

const allowedMime=new Map([["image/jpeg","jpg"],["image/png","png"],["image/webp","webp"]]);

export async function uploadLibraryPhoto(productId:string,file:File):Promise<Pick<LibraryPhoto,"id"|"url"|"title"|"kind"|"caption"|"visibility">> {
  const ext=allowedMime.get(file.type);
  if(!ext)throw new Error("Use imagens JPG, PNG ou WebP.");
  if(file.size>8*1024*1024)throw new Error("A imagem não pode ultrapassar 8 MB.");
  if(file.size===0)throw new Error("A imagem está vazia.");
  if(!/^[0-9a-f-]{36}$/i.test(productId))throw new Error("É necessário salvar o produto antes de enviar imagens.");
  const id=crypto.randomUUID(),path=`${productId}/${id}.${ext}`;
  const {error}=await supabase.storage.from(bucket).upload(path,file,{contentType:file.type,upsert:false,cacheControl:"3600"});
  if(error)throw error;
  return {id,url:libraryPhotoUri(path),title:file.name.replace(/\.[^.]+$/,"").slice(0,120),
    caption:"",kind:"application",visibility:"consultor"};
}
