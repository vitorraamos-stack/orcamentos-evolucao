import { afterEach, describe, expect, it, vi } from "vitest";
import {
  displayLibraryImageBytes, fitLibraryImage, libraryImageSavings,
  LIBRARY_IMAGE_SOURCE_LIMIT_BYTES, LIBRARY_IMAGE_UPLOAD_LIMIT_BYTES,
  optimizeLibraryImage, validateLibraryImageSource,
} from "./image-optimization";

afterEach(()=>vi.unstubAllGlobals());

describe("Biblioteca de Produtos — otimização de fotografias",()=>{
  it("redimensiona sem distorcer, sem ampliar imagens pequenas",()=>{
    expect(fitLibraryImage(4000,2000,1800)).toEqual({width:1800,height:900});
    expect(fitLibraryImage(2000,4000,1800)).toEqual({width:900,height:1800});
    expect(fitLibraryImage(350,200,1800)).toEqual({width:350,height:200});
    expect(fitLibraryImage(0,200,1800)).toThrow(/dimensões/);
  });

  it("rejeita arquivos vazios, formatos inválidos e originais grandes demais",()=>{
    expect(()=>validateLibraryImageSource({type:"image/gif",size:100})).toThrow(/JPG, PNG ou WebP/);
    expect(()=>validateLibraryImageSource({type:"image/jpeg",size:0})).toThrow(/vazia/);
    expect(()=>validateLibraryImageSource({type:"image/jpeg",size:LIBRARY_IMAGE_SOURCE_LIMIT_BYTES+1})).toThrow(/30 MB/);
    expect(()=>validateLibraryImageSource({type:"image/png",size:25*1024*1024})).not.toThrow();
  });

  it("comprime o original antes de enviá-lo, usa WebP real e mantém proporção",async()=>{
    const close=vi.fn(), drawImage=vi.fn();
    const canvas={
      width:0,height:0,
      getContext:()=>({clearRect:vi.fn(),drawImage}),
      toBlob:(callback:(value:Blob)=>void,mime:string)=>{
        callback(new Blob([new Uint8Array(260*1024)],{type:mime}));
      },
    };
    vi.stubGlobal("createImageBitmap",vi.fn(async()=>({width:4000,height:2000,close})));
    vi.stubGlobal("document",{createElement:()=>canvas});
    const source={type:"image/jpeg",size:11*1024*1024,name:"fachada.jpg"} as File;
    const output=await optimizeLibraryImage(source);
    expect(output).toMatchObject({
      mimeType:"image/webp",extension:"webp",
      originalBytes:11*1024*1024,
      width:1800,height:900,optimized:true,
    });
    expect(output.storedBytes).toBe(260*1024);
    expect(output.blob.size).toBeLessThan(LIBRARY_IMAGE_UPLOAD_LIMIT_BYTES);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledOnce();
  });

  it("aplica novas tentativas quando não atinge o alvo de 500 KB",async()=>{
    const sizes=[900,760,610,380];
    const widths:number[]=[];
    const canvas={
      width:0,height:0,
      getContext:()=>({clearRect:vi.fn(),drawImage:vi.fn()}),
      toBlob:(cb:(x:Blob)=>void,type:string)=>{
        widths.push(canvas.width);
        cb(new Blob([new Uint8Array((sizes.shift()||380)*1024)],{type}));
      },
    };
    vi.stubGlobal("createImageBitmap",vi.fn(async()=>({width:3500,height:1750,close:vi.fn()})));
    vi.stubGlobal("document",{createElement:()=>canvas});
    const result=await optimizeLibraryImage({type:"image/png",size:4*1024*1024} as File);
    expect(result.storedBytes).toBe(380*1024);
    expect(widths).toEqual([1800,1800,1600,1400]);
    expect(result.width).toBe(1400);
    expect(result.extension).toBe("webp");
  });

  it("usa o MIME realmente produzido pelo navegador, sem extensão falsa",async()=>{
    const canvas={
      width:0,height:0,
      getContext:()=>({clearRect:vi.fn(),drawImage:vi.fn()}),
      toBlob:(cb:(x:Blob)=>void)=>cb(new Blob([new Uint8Array(100*1024)],{type:"image/png"})),
    };
    vi.stubGlobal("createImageBitmap",vi.fn(async()=>({width:900,height:900,close:vi.fn()})));
    vi.stubGlobal("document",{createElement:()=>canvas});
    const result=await optimizeLibraryImage({type:"image/png",size:2*1024*1024} as File);
    expect(result.mimeType).toBe("image/png");
    expect(result.extension).toBe("png");
  });

  it("mantém fotografias pequenas que já estão mais compactas que a recodificação",async()=>{
    const original=new Blob([new Uint8Array(90*1024)],{type:"image/webp"}) as File;
    const canvas={
      width:0,height:0,
      getContext:()=>({clearRect:vi.fn(),drawImage:vi.fn()}),
      toBlob:(cb:(x:Blob)=>void)=>cb(new Blob([new Uint8Array(120*1024)],{type:"image/webp"})),
    };
    vi.stubGlobal("createImageBitmap",vi.fn(async()=>({width:950,height:520,close:vi.fn()})));
    vi.stubGlobal("document",{createElement:()=>canvas});
    const result=await optimizeLibraryImage(original);
    expect(result.blob).toBe(original);
    expect(result.optimized).toBe(false);
    expect(result.storedBytes).toBe(original.size);
  });

  it("falha sem enviar o original se o navegador não puder processar",async()=>{
    vi.stubGlobal("createImageBitmap",undefined);
    await expect(optimizeLibraryImage({type:"image/jpeg",size:250000} as File)).rejects.toThrow(/navegador/);
  });

  it("relata a economia e apresenta os tamanhos de forma compreensível",()=>{
    expect(libraryImageSavings(4_000_000,400_000)).toBe(90);
    expect(libraryImageSavings(100_000,110_000)).toBe(0);
    expect(displayLibraryImageBytes(225*1024)).toBe("225 KB");
    expect(displayLibraryImageBytes(1572864)).toBe("1,5 MB");
  });
});
